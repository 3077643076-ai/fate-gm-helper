// M1 端到端 API 测试：完整走一遍引擎主流程（测试数据自带清理）
const API = 'http://localhost:8100/api/engine'
const post = async (path, body) => {
  const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { code: r.status, body: await r.json() }
}
const get = async (path) => (await fetch(API + path)).json()

const R = 1 // 第一天回放

console.log('===== 1. 清场 + 初始化位置 =====')
// 直接用回放脚本的清理+落点逻辑（调后端没有专门端点，用 status 确认起点即可）
console.log('当前状态:', JSON.stringify(await get(`/status?campaignId=999002&round=${R}&phase=昼`)).slice(0, 120), '…')

console.log('\n===== 2. 登记行动（含一条解析失败 → 应自动进需裁决） =====')
console.log('狂从 魂食 →', JSON.stringify((await post('/actions', { campaignId: 999002, round: R, phase: '昼', unitKey: '狂从', text: '魂食' })).body))
const fail = await post('/actions', { campaignId: 999002, round: R, phase: '昼', unitKey: '弓从', text: '突突突' })
console.log('弓从 "突突突" →', JSON.stringify(fail.body), '（预期 422+进需裁决）')

console.log('\n===== 3. 前置检查：需裁决未关 → 推进被拦 =====')
const blocked = await post('/advance', { campaignId: 999002, round: R, phase: '昼' })
console.log('HTTP', blocked.code, '→', JSON.stringify(blocked.body.blockers))

console.log('\n===== 4. GM 裁决（关闭需裁决项）=====')
const rulings = await get(`/rulings?campaignId=999002`)
for (const r of rulings) {
  console.log(`裁决 #${r.id}: ${r.context.slice(0, 40)} → 处置：该表述无对应行动，忽略`)
  await post('/rulings/resolve', { id: r.id, resolution: '无对应行动，忽略该输入' })
}

console.log('\n===== 5. 重新推进 =====')
const adv = await post('/advance', { campaignId: 999002, round: R, phase: '昼' })
console.log('HTTP', adv.code)
for (const l of adv.body.report ?? []) console.log('  ' + l)
for (const t of adv.body.todos ?? []) console.log('  [GM待办] ' + t)
for (const e of adv.body.errors ?? []) console.log('  [错误] ' + e)
console.log('  对账:', JSON.stringify(adv.body.totals))

console.log('\n===== 6. 判定单挂点保护（重复挂点应 409）=====')
// 先立一张单（走 gm 工具同款表）
const { DatabaseSync } = await import('node:sqlite')
const db = new DatabaseSync('backend-node/data/gm_helper.db')
db.prepare(`INSERT INTO judgment_ticket (session_id, role, action_name, target, status, roll) VALUES ('apitest', '弓御', '奏乐', 60, 'open', NULL)`).run()
const tid = db.prepare(`SELECT id FROM judgment_ticket WHERE session_id='apitest' ORDER BY id DESC`).get().id
const a1 = await post('/tickets/attach', { id: tid, roll: 15 })
console.log('首次挂点 15/60 →', JSON.stringify(a1.body))
const a2 = await post('/tickets/attach', { id: tid, roll: 80 })
console.log('重复挂点 80/60 →', JSON.stringify(a2.body), '（预期 409 拒绝覆盖）')

// ---------- 清理测试数据 ----------
db.prepare(`DELETE FROM judgment_ticket WHERE session_id = 'apitest'`).run()
db.prepare(`DELETE FROM engine_actions WHERE campaign_id = 999002`).run()
db.prepare(`DELETE FROM engine_pending_ruling WHERE campaign_id = 999002`).run()
db.prepare(`DELETE FROM mana_ledger WHERE source = '行动' OR source = '判定'`).run()
console.log('\n（API 测试数据已清理）')
