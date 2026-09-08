// LLM 离线丰富工具：把规则解析失败的公告片段交给 LLM 学"别名建议"，人确认后入库
// 用法：
//   node tools/llm-enrich.mjs 公告.txt          只显示建议（不写库）
//   node tools/llm-enrich.mjs 公告.txt --apply  显示建议并写入 alias_registry
// 公告文件格式：每行一条公告片段（可从面板日志/群聊记录里摘）
// 需要：DEEPSEEK_API_KEY（backend-node/data/deepseek.key 或环境变量）
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { standardizeAnnouncement } from '../backend-node/engine/parser.mjs'
import { suggestAliases } from '../backend-node/engine/llm.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const db = new DatabaseSync(join(root, 'backend-node', 'data', 'gm_helper.db'))

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const fileArg = args.find(a => !a.startsWith('--'))
if (!fileArg) {
  console.log('用法：node tools/llm-enrich.mjs <公告文件> [--apply]')
  process.exit(1)
}

const campaignId = 999002
const texts = readFileSync(fileArg, 'utf8').split('\n').map(s => s.trim()).filter(Boolean)

// 1) 规则解析：收集失败片段（别名/口径看不懂的部分）
const failFragments = new Set()
const unitGuess = texts.length ? '弓从' : '弓从' // 解析失败片段与单位关系不大，动词归一为准
for (const text of texts) {
  const { failures } = standardizeAnnouncement(db, text, { campaignId, round: 1, phase: '昼', unitKey: unitGuess })
  for (const f of failures) failFragments.add(f.fragment)
}
const fragments = [...failFragments]
console.log(`公告 ${texts.length} 条 → 规则解析失败片段 ${fragments.length} 个`)
if (!fragments.length) { console.log('没有需要丰富的新别名，全部片段规则可解析。'); process.exit(0) }
fragments.forEach((f, i) => console.log(`  ${i + 1}. ${f}`))

// 2) LLM 产别名建议（带白名单约束）
const verbs = db.prepare(`SELECT action_key FROM action_rules ORDER BY action_key`).all().map(r => r.action_key)
const leylines = db.prepare(`SELECT name FROM leyline WHERE campaign_id = ?`).all(campaignId).map(r => r.name)
console.log('\n调用 LLM 生成别名建议…')
const llm = await suggestAliases(fragments, { verbs, leylines })
if (!llm.ok) { console.error('LLM 调用失败：' + llm.error); process.exit(1) }
if (!llm.suggestions.length) { console.log('LLM 也给不出建议（这些片段可能真的没规则，走需裁决由 GM 定义）'); process.exit(0) }

// 3) 展示建议
console.log('\n===== 别名建议 =====')
for (const s of llm.suggestions) {
  console.log(`  "${s.alias}" → ${s.verb}${s.target ? ' ' + s.target : ''}${s.note ? `（${s.note}）` : ''}`)
}

// 4) 入库（--apply 时）或提示
if (apply) {
  const ins = db.prepare(`INSERT OR REPLACE INTO alias_registry (alias, canonical, kind, note) VALUES (?, ?, 'action', ?)`)
  let n = 0
  for (const s of llm.suggestions) {
    const canonical = s.target ? `${s.verb} ${s.target}` : s.verb
    ins.run(s.alias, canonical, s.note)
    n++
  }
  console.log(`\n已入库 ${n} 条别名（kind=action）。引擎下次解析即生效。`)
} else {
  console.log('\n预览模式：加 --apply 参数写入别名表。')
}

// token 用量粗估（提示成本量级）
const chars = fragments.join('').length + 800
console.log(`（本次 LLM 用量约 ${Math.ceil(chars * 0.7)} token ≈ 几厘钱）`)
