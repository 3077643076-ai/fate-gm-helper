// M3 端到端 v2：修正双计 bug 后重跑（术组 vs 枪组 @许都）
const API = 'http://localhost:8100/api/engine/battles'
const post = async (path, body) => {
  const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { code: r.status, body: await r.json() }
}
const get = async (path) => (await fetch(API + path)).json()

console.log('===== 1. 创建战斗 =====')
const created = await post('/', {
  campaignId: 999002, round: 2, phase: '昼', leyline: '许都', width: 5, attacker: 'blue',
  blue: { main: '枪从', assists: ['枪御'] },
  yellow: { main: '术从', assists: ['术御'] },
})
console.log(`战斗 #${created.body.battleId}｜枪合计 ${JSON.stringify(created.body.blueTotals)}`)
console.log(`              术合计 ${JSON.stringify(created.body.yellowTotals)}`)
const id = created.body.battleId

console.log('\n===== 2. 战术：枪=强击，术=破袭（破袭克强击 → 强击无效） =====')
const tac = await post(`/${id}/tactics`, { blue: '强击', yellow: '破袭' })
console.log(`克制: ${tac.body.counter}｜强击无效: ${tac.body.invalid.blue}｜破袭效果: 术方对吕布底限穿透-20%`)

console.log('\n===== 3. 初始工序：主要属性（吕布=筋力，张角=魔力） =====')
const attrs = await post(`/${id}/attrs`, { blue: 'strength', yellow: 'mana' })
const wr = attrs.body.winRate
console.log(`随机属性骰出: ${attrs.body.randomAttr}`)
for (const c of wr.comparisons) console.log(`  ${c.label}: ${c.a} vs ${c.b} → ${c.score === 3 ? '优' : c.score === 2 ? '平' : '劣'}`)
console.log(`基础胜率 ${wr.baseRate}%｜等级差 ${wr.levelDiff}｜当前胜率 ${wr.actual}%`)

console.log('\n===== 4. 主要工序：能力发动（吕布宝具属性补正+30；张角太平要术胜率-10） =====')
const c1 = await post(`/${id}/correction`, { stage: 'statBonus', side: 'blue', value: 30, note: '吕布宝具属性补正' })
console.log(`蓝属性+30 → 胜率 ${c1.body.winRate.actual}%`)
const c2 = await post(`/${id}/correction`, { stage: 'main', side: 'yellow', value: -10, note: '太平要术' })
console.log(`术胜率-10 → 胜率 ${c2.body.winRate.actual}%`)

console.log('\n===== 5. 最终工序：张角死斗（+20，不可撤退）→ 决胜 =====')
const fin = await post(`/${id}/finalize`, { yellowDeath: true, roll: 55 })
console.log(`最终胜率: ${fin.body.rate}%｜决胜 D100=${fin.body.roll} → ${fin.body.winner === 'blue' ? '枪组胜' : '术组胜'}`)

console.log('\n===== 6. 清算 =====')
for (const l of fin.body.ledger ?? []) console.log(`  ${l.role}: ${l.delta}（${l.reason}）`)

console.log('\n===== 7. 战斗记录 =====')
const full = await get(`/battles/${id}`)
console.log(`状态 ${full.status}｜战术 ${full.blue_tactic}/${full.yellow_tactic}｜属性 ${full.blue_main_attr}/${full.yellow_main_attr}/随机${full.random_attr}｜胜方 ${full.result ? JSON.parse(full.result).winner : '?'}`)

const { DatabaseSync } = await import('node:sqlite')
const db = new DatabaseSync('backend-node/data/gm_helper.db')
db.prepare(`DELETE FROM engine_battles WHERE id = ?`).run(id)
db.prepare(`DELETE FROM mana_ledger WHERE source = '战斗'`).run()
console.log('\n（测试战斗已清理）')
