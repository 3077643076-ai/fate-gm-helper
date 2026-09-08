// API 多动登记测试（node fetch，中文安全）
const post = async (path, body) => {
  const r = await fetch('http://localhost:8100/api/engine' + path, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) })
  return { code: r.status, body: await r.json().catch(() => ({})) }
}

const a1 = await post('/actions', { campaignId: 999002, round: 1, phase: '昼', unitKey: '术御', text: '一动：搓空花 二动：制作制裁机关' })
console.log(`[${a1.code}]`, JSON.stringify(a1.body, null, 2))

const a2 = await post('/actions', { campaignId: 999002, round: 1, phase: '昼', unitKey: '狂从', text: '开殿 然后广侦' })
console.log(`[${a2.code}]`, JSON.stringify(a2.body.registered ?? a1.body))

// 清理测试登记
const { DatabaseSync } = await import('node:sqlite')
const db = new DatabaseSync('backend-node/data/gm_helper.db')
db.prepare(`DELETE FROM engine_actions WHERE campaign_id = 999002`).run()
db.prepare(`DELETE FROM engine_pending_ruling WHERE campaign_id = 999002`).run()
console.log('（测试数据已清理）')
