// 行动统计 / 一键催未交 端到端测试（离线：QQ 端口用不可达地址验容错，不真连 NapCat）
// 覆盖：规范文本按结算链排序（与 settler 同口径）/ 单位与职阶汇总 / void 剔除 /
//       公告状态容错 / 无群映射报错 / notices/check 重构后回归
// 运行：node backend-node/engine/e2e-summary.mjs
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ===== 0. 临时库（必须在 import router 之前设好路径——router 在导入时就开库） =====
const dir = mkdtempSync(join(tmpdir(), 'summary-e2e-'))
const dbPath = join(dir, 'test.db')
process.env.FATE_GM_DB_PATH = dbPath

const express = (await import('express')).default
const { openEngineDb } = await import('./store.mjs')
const router = (await import('./router.mjs')).default

let passed = 0
let failed = 0
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  [通过] ${name}`) }
  else { failed++; console.log(`  [失败] ${name} ${extra}`) }
}

const db = openEngineDb(dbPath)

// ===== 1. 基础数据：两职阶四单位 / 四条行动规则 / 两个私组 =====
const CAMPAIGN = 999003
db.prepare(`INSERT INTO campaign (id, name) VALUES (?, ?)`).run(CAMPAIGN, '测试杯-统计')
db.prepare(`INSERT INTO campaign_round (campaign_id, turn_number, status) VALUES (?, 3, 'OPEN')`).run(CAMPAIGN)
const classOf = { 术从: '术', 术御: '术', 弓从: '弓', 弓御: '弓' }
for (const [key, cls] of Object.entries(classOf)) {
  db.prepare(`INSERT INTO unit_registry (unit_key, class, side, code) VALUES (?, ?, 'blue', ?)`).run(key, cls, key + '真名')
}
for (const [key, phase] of [['机动', '机动'], ['魂食', '魂食'], ['广泛侦查', '信息'], ['休整', '休整']]) {
  db.prepare(`INSERT INTO action_rules (action_key, phase, costs_action, base_rate) VALUES (?, ?, 1, ?)`)
    .run(key, phase, key === '广泛侦查' ? 30 : null)
}
db.prepare(`INSERT INTO engine_group_binding (campaign_id, group_id, group_name, kind, class) VALUES (?, '20001', '术私组', 'private', '术')`).run(CAMPAIGN)
db.prepare(`INSERT INTO engine_group_binding (campaign_id, group_id, group_name, kind, class) VALUES (?, '20002', '弓私组', 'private', '弓')`).run(CAMPAIGN)

// 故意乱序插入（证明排序口径不是插入顺序）：休整→广侦→魂食→机动(void)→机动→机动
const ins = db.prepare(
  `INSERT INTO engine_actions (campaign_id, round, phase, unit_key, slot, action_key, target, variant, raw_text, status)
   VALUES (?, 3, '昼', ?, ?, ?, ?, ?, ?, ?)`
)
ins.run(CAMPAIGN, '弓从', 1, '休整', null, null, '休整', 'declared')                 // id1 rank60
ins.run(CAMPAIGN, '术从', 1, '广泛侦查', null, null, '广侦', 'declared')             // id2 rank50
ins.run(CAMPAIGN, '术从', 2, '魂食', '新野', '遮断', '魂食遮断 新野', 'declared')    // id3 rank10
ins.run(CAMPAIGN, '弓御', 1, '机动', '许昌', null, '机动 许昌', 'void')              // id4 rank0 已作废
ins.run(CAMPAIGN, '术御', 1, '机动', '许昌', null, '机动许昌', 'declared')           // id5 rank0
ins.run(CAMPAIGN, '弓从', 2, '机动', '新野', null, '动车 新野', 'declared')          // id6 rank0

// ===== 2. 起服务 =====
const app = express()
app.use(express.json())
app.use('/api/engine', router)
const server = app.listen(0)
await new Promise(r => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}`
const api = async (path, init) => {
  const r = await fetch(base + path, init)
  return { status: r.status, body: await r.json() }
}
const post = (path, payload) => api(path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
})

try {
  // ===== 3. 行动统计（纯本地库视角） =====
  console.log('\n===== 3. GET /actions/summary（排序与汇总） =====')
  const { status: s3, body: sum } = await api(`/api/engine/actions/summary?campaignId=${CAMPAIGN}`)
  check('HTTP 200', s3 === 200, JSON.stringify(sum).slice(0, 120))
  check('回合/时段默认取 OPEN 回合', sum.round === 3 && sum.phase === '昼', `${sum.round}/${sum.phase}`)

  const keys = sum.actions.map(a => a.actionKey)
  check('排序=结算链（机动→魂食→广泛侦查→休整），非插入顺序',
    JSON.stringify(keys) === JSON.stringify(['机动', '机动', '机动', '魂食', '广泛侦查', '休整']), JSON.stringify(keys))
  check('同链段内 一动 先于 二动', sum.actions[0].slot === 1 && sum.actions[1].slot === 1 && sum.actions[2].slot === 2,
    sum.actions.slice(0, 3).map(a => `${a.unitKey}#${a.slot}`).join(','))
  check('同链段内按单位键稳定排序', sum.actions[0].unitKey === '弓御' && sum.actions[1].unitKey === '术御' && sum.actions[2].unitKey === '弓从',
    sum.actions.slice(0, 3).map(a => a.unitKey).join(','))

  check('结算链分段=4 段且顺序正确',
    JSON.stringify(sum.chainSections.map(x => x.chain)) === JSON.stringify(['机动', '魂食', '信息', '休整']),
    JSON.stringify(sum.chainSections.map(x => [x.chain, x.actions.length])))
  check('分段 rank 升序', sum.chainSections.every((x, i, arr) => i === 0 || arr[i - 1].rank < x.rank),
    JSON.stringify(sum.chainSections.map(x => x.rank)))

  const kui = sum.actions.find(a => a.actionKey === '魂食')
  check('规范文本含单位/目标/变体/链位置',
    kui.standard.includes('术从 魂食') && kui.standard.includes('→ 新野') && kui.standard.includes('遮断') && kui.standard.includes('链:魂食'),
    kui.standard)
  check('规范文本带时段头', kui.standard.startsWith('第3天昼'), kui.standard)
  const guang = sum.actions.find(a => a.actionKey === '广泛侦查')
  check('判定值随规则表带出（广侦 30%+昼补正）', guang.standard.includes('判定30%'), guang.standard)
  check('原文保留（供核对/悬停）', kui.rawText === '魂食遮断 新野', kui.rawText)
  check('单位真名映射到代号字段', kui.unitCode === '术从真名' && kui.class === '术', `${kui.unitCode}/${kui.class}`)

  const t = sum.summary
  check('总计 6 动 / 有效 5 / 作废 1', t.actionsTotal === 6 && t.actionsActive === 5 && t.actionsVoid === 1, JSON.stringify(t))
  check('应交单位 4（私组职阶×从/御）', t.unitsExpected === 4, String(t.unitsExpected))
  check('已交单位 3（弓御只有 void 不计入）', t.unitsRegistered === 3, String(t.unitsRegistered))
  check('无场外单位', Array.isArray(t.extraUnits) && t.extraUnits.length === 0, JSON.stringify(t.extraUnits))
  check('需裁决 0', t.pendingRulings === 0, String(t.pendingRulings))
  check('未传 napcatBase 时公告状态为 null 且无报错', t.groupsSubmitted === null && sum.noticesError === null, JSON.stringify(t))

  const shu = sum.groups.find(g => g.class === '术')
  const gong = sum.groups.find(g => g.class === '弓')
  check('术组 3 动（术从2+术御1）', shu.actionCount === 3 && shu.units.sort().join(',') === '术从,术御', JSON.stringify(shu))
  check('弓组 2 动（弓御 void 剔除）', gong.actionCount === 2 && gong.units.join(',') === '弓从', JSON.stringify(gong))
  check('未检查公告时组状态为 null', shu.hasNotice === null && shu.noticeError === null, JSON.stringify(shu))

  check('单位汇总含 void 计数', sum.units.find(u => u.unitKey === '弓御')?.void === 1, JSON.stringify(sum.units))

  // ===== 4. 参数校验 =====
  console.log('\n===== 4. 参数校验 / 错误路径 =====')
  const noCampaign = await api('/api/engine/actions/summary')
  check('缺 campaignId → 400', noCampaign.status === 400, JSON.stringify(noCampaign.body))
  const zeroCampaign = await api('/api/engine/actions/summary?campaignId=0')
  check('campaignId=0 → 400（绝不默认到某个杯）', zeroCampaign.status === 400, JSON.stringify(zeroCampaign.body))

  const noGroups = await post('/api/engine/notices/remind-missing', { campaignId: 999004, napcatBase: 'http://127.0.0.1:1' })
  check('无群映射战役催办 → 400 并给出原因', noGroups.status === 400 && String(noGroups.body.error).includes('私组群映射'), JSON.stringify(noGroups.body))
  const remindNoBase = await post('/api/engine/notices/remind-missing', { campaignId: CAMPAIGN })
  check('催办缺 napcatBase → 400', remindNoBase.status === 400, JSON.stringify(remindNoBase.body))

  // ===== 5. NapCat 不可达时的容错（不炸接口） =====
  console.log('\n===== 5. NapCat 不可达容错 =====')
  const dead = 'http://127.0.0.1:1'
  const withNapcat = await api(`/api/engine/actions/summary?campaignId=${CAMPAIGN}&napcatBase=${encodeURIComponent(dead)}`)
  check('统计接口仍 200', withNapcat.status === 200, String(withNapcat.status))
  check('2 组全部记为读取失败', withNapcat.body.summary.groupsFailed === 2, JSON.stringify(withNapcat.body.summary))
  check('组行带 noticeError（面板可显示）', withNapcat.body.groups.every(g => g.noticeError), JSON.stringify(withNapcat.body.groups))
  check('本地库行动统计不受 QQ 影响', withNapcat.body.summary.actionsActive === 5, String(withNapcat.body.summary.actionsActive))

  const checkRegress = await post('/api/engine/notices/check', { campaignId: CAMPAIGN, napcatBase: dead })
  check('重构后 /notices/check 仍正常返回结构', checkRegress.status === 200 && checkRegress.body.checked.length === 0 && checkRegress.body.failed.length === 2,
    JSON.stringify(checkRegress.body).slice(0, 160))
  check('check 的 missing 为空（读不到≠未交）', Array.isArray(checkRegress.body.missing) && checkRegress.body.missing.length === 0, JSON.stringify(checkRegress.body.missing))

  // ===== 6. 幂等：重复统计不产生副作用 =====
  console.log('\n===== 6. 只读性 =====')
  const again = await api(`/api/engine/actions/summary?campaignId=${CAMPAIGN}`)
  check('重复调用结果一致（只读无副作用）', JSON.stringify(again.body.actions) === JSON.stringify(sum.actions))
} finally {
  server.close()
  // 本脚本的连接可关；router/db.js 持有的连接无法从外部关，Windows 下文件可能仍被占用
  try { db.close() } catch { /* 已关 */ }
  try { rmSync(dir, { recursive: true, force: true }) } catch { console.log('（临时库仍被占用，留在 tmp 目录）') }
}

console.log(`\n===== 结果：${passed} 通过 / ${failed} 失败 =====`)
if (failed) process.exit(1)
