// 解析压力测试：14 单位 × 14 行动类 = 196 条「糊弄话」（简写/俗称/谐音/口语）
//   用法：node tools/parser-stress.mjs [campaignId=999002]
//   每个单位 × 每类行动各取一种糊弄写法（按单位序号轮换变体，保证 14×14 全覆盖）
//   输出：分类通过率 + 失败清单（动词不认识 vs 目标解析失败），用于补别名/口径
import { createRequire } from 'node:module'
import { parseAction } from '../backend-node/engine/parser.mjs'

const requireCjs = createRequire(import.meta.url)
const Database = requireCjs('../backend-node/node_modules/better-sqlite3')
const campaignId = Number(process.argv[2]) || 999002
const db = new Database('backend-node/data/gm_helper.db', { readonly: true })

const units = db.prepare('SELECT unit_key FROM unit_registry ORDER BY unit_key').all().map(r => r.unit_key)

// 14 类行动 × 糊弄变体池（玩家可能怎么乱写：简写/俗称/谐音/口语/加戏）
const CATEGORIES = [
  { name: '机动', pool: ['机动 灵脉-A', '位移 灵脉-B', '移动 灵脉-C', '去 灵脉-D'] },
  { name: '魂食', pool: ['魂食 灵脉-A', '吃饭 灵脉-B', '吸食 灵脉-C', '进食 灵脉-D'] },
  { name: '魂食遮断', pool: ['魂食遮断 灵脉-A', '遮断 灵脉-B', '挡饭 灵脉-C', '魂食 遮断 灵脉-D'] },
  { name: '恶性魂食', pool: ['恶性魂食 灵脉-A', '恶食 灵脉-B', '恶性 灵脉-C'] },
  { name: '无限制魂食', pool: ['无限制魂食 灵脉-A', '无限魂食 灵脉-B', '无限 灵脉-C'] },
  { name: '干涉', pool: ['干涉 灵脉-A', '干预 灵脉-B', '干涉 灵脉-C'] },
  { name: '袭击', pool: ['袭击 灵脉-A', '偷袭 灵脉-B', '夜袭 灵脉-C'] },
  { name: '广泛侦查', pool: ['广泛侦查', '广侦', '广域侦查', '广泛侦查（全图）'] },
  { name: '情报调查', pool: ['情报调查 吕布', '调查 吕布', '情报侦查 吕布', '查一下 吕布'] },
  { name: '资料分析', pool: ['资料分析', '资分', '资料分柝', '分析资料'] },
  { name: '真名猜测', pool: ['真名猜测 吕布', '猜名 吕布', '真名推定 吕布', '猜 吕布的真名'] },
  { name: '休整', pool: ['休整', '休息', '休生', '苟一轮'] },
  { name: '介入', pool: ['介入 灵脉-A', '介入 机动', '介入 袭击', '介入B'] },
  { name: '灵脉自定义/技能宝具', pool: ['奏乐', '乐不思蜀', '结阵', '宝具 幻想全满', '技能 千里眼'] },
]

let pass = 0, fail = 0
const failsByCat = new Map()
const seen = new Set()

for (const cat of CATEGORIES) {
  for (let i = 0; i < units.length; i++) {
    const unitKey = units[i]
    const text = cat.pool[i % cat.pool.length]
    const dup = seen.has(`${unitKey}|${text}`)
    seen.add(`${unitKey}|${text}`)
    const r = parseAction(db, text, { campaignId, round: 3, phase: '昼', unitKey })
    if (r.ok) { pass++; continue }
    fail++
    const kind = r.message?.includes('白名单') ? '动词' : '目标/其他'
    const list = failsByCat.get(cat.name) ?? []
    list.push({ unitKey, text, kind, message: r.message, dup })
    failsByCat.set(cat.name, list)
  }
}

const total = pass + fail
console.log(`\n===== 解析压力测试：${units.length} 单位 × ${CATEGORIES.length} 类 = ${total} 条 =====`)
console.log(`通过 ${pass}（${Math.round(pass / total * 100)}%）  失败 ${fail}\n`)
for (const [cat, list] of failsByCat) {
  console.log(`── ${cat}（失败 ${list.length}）──`)
  const verbFails = list.filter(f => f.kind === '动词')
  const otherFails = list.filter(f => f.kind !== '动词')
  if (verbFails.length) console.log(`  动词不认识: ${[...new Set(verbFails.map(f => `"${f.text}"`))].join('、')}`)
  if (otherFails.length) for (const f of otherFails) console.log(`  [${f.unitKey}] "${f.text}" → ${f.message}`)
}
if (!failsByCat.size) console.log('全部通过，糊弄话全接住了。')
