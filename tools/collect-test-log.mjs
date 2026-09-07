// 测试日志收集器：带团测试后跑一次，把复盘需要的素材汇总到一个目录
// 用法：node tools/collect-test-log.cjs
// 产出：logs/test-log-<日期时间>/ 目录（要发给别人就右键压缩成 zip）
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)
const outDir = join(root, 'logs', `test-log-${stamp}`)
mkdirSync(join(outDir, 'dsh-sessions'), { recursive: true })

const copied = []
function tryCopy(src, destName) {
  if (!src || !existsSync(src)) return
  try {
    copyFileSync(src, join(outDir, destName))
    copied.push(`${destName}  ← ${src}`)
  } catch (e) {
    copied.push(`[失败] ${destName}: ${e.message}`)
  }
}

// ---------- 1. dsh 会话记录（fate-gm-helper 项目下最新的几个 zstd） ----------
const sessionsBase = join(process.env.USERPROFILE, '.dsh', 'sessions')
const gmDir = readdirSync(sessionsBase).find(d => d.includes('fate-gm-helper'))
if (gmDir) {
  const dir = join(sessionsBase, gmDir)
  const zstdFiles = []
  for (const sub of readdirSync(dir, { withFileTypes: true })) {
    const p = sub.isDirectory() ? join(dir, sub.name, 'session.jsonl.zstd') : join(dir, sub.name)
    if (existsSync(p) && p.endsWith('.zstd')) zstdFiles.push({ p, mtime: statSync(p).mtimeMs })
  }
  // 只带最近修改的 3 个（今天的测试会话）
  zstdFiles.sort((a, b) => b.mtime - a.mtime).slice(0, 3)
    .forEach((f, i) => tryCopy(f.p, join('dsh-sessions', `recent-${i + 1}-${f.p.split('\\').pop()}`)))
} else {
  copied.push('[未找到] dsh 会话目录（~/.dsh/sessions 下无 fate-gm-helper 项目）')
}

// ---------- 2. 群聊记录（机器人落盘，多候选路径逐个找） ----------
const chatCandidates = [
  join(root, '1.15', '群聊记录-三国杯.jsonl'),
  'X:/dev/dev/fate-gm-helper-main/1.15/群聊记录-三国杯.jsonl',
  join(root, 'logs', '群聊记录-三国杯.jsonl'),
]
for (const p of chatCandidates) {
  if (existsSync(p)) { tryCopy(p, '群聊记录-三国杯.jsonl'); break }
}

// ---------- 3. 库数据导出：账本 / 判定单 / 别名 / 口径（复盘对账的核心） ----------
try {
  const db = new DatabaseSync(join(root, 'backend-node', 'data', 'gm_helper.db'))
  const dump = (sql, file) => {
    try {
      const rows = db.prepare(sql).all()
      writeFileSync(join(outDir, file), JSON.stringify(rows, null, 2), 'utf8')
      copied.push(`${file}（${rows.length} 行）`)
    } catch (e) { copied.push(`[失败] ${file}: ${e.message}`) }
  }
  dump(`SELECT * FROM mana_ledger ORDER BY id`, 'mana_ledger.json')
  dump(`SELECT * FROM judgment_ticket ORDER BY id`, 'judgment_ticket.json')
  dump(`SELECT alias, canonical, kind, note FROM alias_registry ORDER BY kind, alias`, 'alias_registry.json')
  dump(`SELECT rule_key, rule_text, status FROM mana_rules ORDER BY rule_key`, 'mana_rules.json')
  dump(`SELECT id, code, class_name, card_type, retired FROM character_card WHERE campaign_id = 999002`, 'cards-999002.json')
  dump(`SELECT id, name, mana_amount, population_flow, battlefield_width FROM leyline WHERE campaign_id = 999002`, 'leylines-999002.json')
} catch (e) {
  copied.push(`[失败] 库导出: ${e.message}`)
}

// ---------- 4. SOP 与 NOTES 快照（对照"AI 哪句话没按 SOP 走"） ----------
tryCopy(join(root, 'docs', '带团SOP.md'), '带团SOP.md')
tryCopy(join(root, 'NOTES.md'), 'NOTES.md')

console.log(`收集完成 → ${outDir}\n`)
console.log(copied.map(c => '  ' + c).join('\n'))
console.log('\n发给别人前可右键此目录压缩为 zip。')
