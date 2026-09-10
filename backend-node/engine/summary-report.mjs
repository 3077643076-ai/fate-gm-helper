// 行动统计报告（CLI）：直接打印某战役/回合/时段的「规范文本 + 结算链排序」
// 用途：不开面板也能核对统计与排序；或作为接口实现的冒烟验证
// 只读，不写库。运行：
//   node backend-node/engine/summary-report.mjs <campaignId> [round] [phase]
//   库路径默认 backend-node/data/gm_helper.db，可用 FATE_GM_DB_PATH 覆盖（建议指向副本）
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const backendRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const dbPath = process.env.FATE_GM_DB_PATH || join(backendRoot, 'data', 'gm_helper.db')
if (!existsSync(dbPath)) {
  console.error(`库文件不存在：${dbPath}\n（用 FATE_GM_DB_PATH 指定路径，或先在主站建战役）`)
  process.exit(1)
}
process.env.FATE_GM_DB_PATH = dbPath

const [campaignId, roundArg, phaseArg] = process.argv.slice(2)
if (!campaignId) {
  console.error('用法：node backend-node/engine/summary-report.mjs <campaignId> [round] [phase]')
  process.exit(1)
}

const express = (await import('express')).default
const router = (await import('./router.mjs')).default
const app = express()
app.use(express.json())
app.use('/api/engine', router)
const server = app.listen(0)
await new Promise(r => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}`

const qs = new URLSearchParams({ campaignId })
if (roundArg) qs.set('round', roundArg)
if (phaseArg) qs.set('phase', phaseArg)
const r = await fetch(`${base}/api/engine/actions/summary?${qs}`)
const body = await r.json()
if (!r.ok) {
  console.error('统计失败：' + body.error)
  server.close()
  process.exit(1)
}

const s = body.summary
console.log(`=== 战役 ${campaignId} · 第${body.round}天${body.phase} 行动统计 ===`)
console.log(`行动 ${s.actionsActive} 动有效${s.actionsVoid ? ` / ${s.actionsVoid} 动作废` : ''}｜单位 ${s.unitsRegistered}/${s.unitsExpected}${s.extraUnits.length ? `（场外：${s.extraUnits.join('、')}）` : ''}｜需裁决 ${s.pendingRulings}`)
console.log('单位：' + (body.units.map(u => `${u.unitKey} ${u.active}动${u.void ? `(+${u.void}作废)` : ''}`).join('｜') || '（无）'))
console.log('应交：' + (body.expectedUnits.join('、') || '（无私组群映射）'))

console.log('\n规范文本（按结算链排序 = 引擎结算顺序）：')
if (!body.chainSections.length) console.log('  （本时段还没有登记行动）')
for (const sec of body.chainSections) {
  console.log(`  ── ${sec.chain} ──`)
  for (const a of sec.actions) {
    const mark = a.status === 'void' ? '✗作废' : a.status === 'settled' ? '✓已结算' : a.status === 'deferred' ? '…延后' : ''
    console.log(`     ${a.standard}${a.slot > 1 ? ` [${a.slot}动]` : ''}${mark ? ` ${mark}` : ''}`)
  }
}
console.log('\n提示：加上第 4 个参数作为 NapCat 地址可同时显示各私组公告状态（会真连 NapCat）')
server.close()
