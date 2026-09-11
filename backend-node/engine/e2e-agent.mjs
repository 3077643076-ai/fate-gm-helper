// v0.5 AI 助手端到端测试（离线：QQ 端口打桩、LLM 关闭）
// 覆盖：出口闸真名替换/渠道拦截 → 角色前缀分段登记 → 私组确认回执 → 催未交 → 公告幂等去重
// 运行：node backend-node/engine/e2e-agent.mjs
import { openEngineDb } from './store.mjs'
import { collectActions, getAgentConfig, setAgentConfig, textHash } from './agent.mjs'
import { screenOutbound, loadGateLexicon } from './exitgate.mjs'
import { splitByRole, extractTimeHeader } from './agent.mjs'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

// ===== 0. 临时库 + 基础数据 =====
const dir = mkdtempSync(join(tmpdir(), 'agent-e2e-'))
const db = openEngineDb(join(dir, 'test.db'))
let passed = 0
let failed = 0
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  [通过] ${name}`) }
  else { failed++; console.log(`  [失败] ${name} ${extra}`) }
}

db.prepare(`INSERT INTO campaign (id, name) VALUES (999001, '测试杯-agent')`).run()
db.prepare(`INSERT INTO campaign_round (campaign_id, turn_number, status) VALUES (999001, 2, 'OPEN')`).run()
db.prepare(`INSERT INTO character_card (id, code, campaign_id, card_type) VALUES (1, '张角', 999001, 'SERVANT')`).run()
db.prepare(`INSERT INTO character_card (id, code, campaign_id, card_type) VALUES (2, '曹植', 999001, 'MASTER')`).run()
db.prepare(`INSERT INTO unit_registry (unit_key, class, side, code, card_id) VALUES ('术从', '术', 'blue', '张角', 1)`).run()
db.prepare(`INSERT INTO unit_registry (unit_key, class, side, code, card_id) VALUES ('术御', '术', 'blue', '曹植', 2)`).run()
db.prepare(`INSERT INTO leyline (campaign_id, name) VALUES (999001, '新野')`).run()
for (const [key, phase] of [['机动', '机动'], ['休整', '休整'], ['广泛侦查', '信息']]) {
  db.prepare(`INSERT INTO action_rules (action_key, phase, costs_action) VALUES (?, ?, 1)`).run(key, phase)
}
db.prepare(`INSERT INTO engine_group_binding (campaign_id, group_id, group_name, kind, class) VALUES (999001, '10001', '术私组', 'private', '术')`).run()
db.prepare(`INSERT INTO engine_group_binding (campaign_id, group_id, group_name, kind, class) VALUES (999001, '10002', '弓私组', 'private', '弓')`).run()

// ===== 1. 小工具单测 =====
console.log('\n===== 1. splitByRole / extractTimeHeader =====')
const parts = splitByRole('第2天昼 | 从者：机动 新野 | 御主 休整')
check('角色分段=2 段（纯时段头段丢弃）', parts.length === 2, JSON.stringify(parts))
check('御主段识别', parts[1].role === '御主' && parts[1].part === '休整')
check('天数识别', extractTimeHeader('第2天昼')?.round === 2 && extractTimeHeader('第一天夜')?.round === 1)
check('英文天数识别', extractTimeHeader('day3昼')?.round === 3)

// ===== 2. 出口闸 =====
console.log('\n===== 2. 出口闸（真名替换 / 渠道白名单） =====')
const lex = loadGateLexicon(db, 999001)
check('词典收录真名', lex.entries.some(e => e.name === '张角' && e.unitKey === '术从'), JSON.stringify(lex.entries))
const g1 = screenOutbound(db, 999001, '张角 与 曹植 的魔力已更新', 'private')
check('私组真名替换', !g1.blocked && g1.text.includes('术从') && g1.text.includes('术御') && g1.hits.length === 2, g1.text)
const g2 = screenOutbound(db, 999001, '测试', 'leyline')
check('灵脉群渠道拦截', g2.blocked)
const g3 = screenOutbound(db, 999001, '测试', 'public')
check('公屏渠道拦截', g3.blocked)

// ===== 3. 收行动工作流（QQ 打桩） =====
console.log('\n===== 3. 收行动工作流 =====')
const sent = []           // 发出去的消息 [groupId, text]
const stubNotices = {
  10001: [{ text: '第2天昼 | 从者：机动 新野 | 御主 休整', pubTime: 'x' }],
  10002: [],             // 弓组未交
}
const ports = {
  fetchNotices: async (_base, gid) => stubNotices[gid] ?? [],
  sendMsg: async (_base, gid, text) => { sent.push([gid, text]) },
}
setAgentConfig(db, { agentLlmEnabled: '0', napcatHttpBase: 'http://stub', agentTokenBudget: '100' })
const cfg = getAgentConfig(db)
check('配置写入生效', cfg.agentLlmEnabled === '0' && cfg.napcatHttpBase === 'http://stub')

const sum = await collectActions(db, 999001, { ports, config: cfg })
check('登记 2 条（术从机动+术御休整）', sum.totals.registered === 2, JSON.stringify(sum.totals))
const actFrom = db.prepare(`SELECT unit_key, action_key, target FROM engine_actions WHERE campaign_id = 999001 ORDER BY id`).all()
check('术从 机动→新野（角色段归单位键）', actFrom.some(a => a.unit_key === '术从' && a.action_key === '机动' && a.target === '新野'), JSON.stringify(actFrom))
check('御主段归术御', actFrom.some(a => a.unit_key === '术御' && a.action_key === '休整'))
check('天数从公告头取（round=2）', db.prepare(`SELECT COUNT(*) AS n FROM engine_actions WHERE round = 2`).get().n === 2)
check('术组收到确认回执', sent.some(([gid, t]) => gid === '10001' && t.includes('已登记：成功 2 条')), JSON.stringify(sent))
check('弓组被催交', sent.some(([gid, t]) => gid === '10002' && t.includes('行动提醒')))
check('运行摘要：1 组已交 1 组催办', sum.totals.submitted === 1 && sum.totals.reminded === 1, JSON.stringify(sum.totals))
check('审计日志有 run 记录', db.prepare(`SELECT COUNT(*) AS n FROM agent_log WHERE step = 'run'`).get().n >= 1)
check('公告已入消息日志', db.prepare(`SELECT COUNT(*) AS n FROM message_log WHERE channel = 'notice' AND text_hash = ?`).get(textHash(stubNotices[10001][0].text)).n === 1)
check('外发回执入消息日志', db.prepare(`SELECT COUNT(*) AS n FROM message_log WHERE channel = 'agent_out'`).get().n >= 1)

// ===== 4. 幂等：同公告再跑一遍不重复登记 =====
console.log('\n===== 4. 公告幂等（重复跑不重复登记） =====')
const sent2 = []
const ports2 = { ...ports, sendMsg: async (_b, gid, t) => { sent2.push([gid, t]) } }
const sum2 = await collectActions(db, 999001, { ports: ports2, config: cfg })
check('第二轮不新增登记', sum2.totals.registered === 0, JSON.stringify(sum2.totals))
check('已交组整组 hash 跳过（不重解析不重复建裁决）',
  sum2.groups.filter(g => g.submitted).every(g => g.hashSkipped === true) && sum2.totals.rulings === 0,
  JSON.stringify(sum2.groups))
check('无登记不发确认回执（不刷屏）', !sent2.some(([gid]) => gid === '10001'))

// ===== 清理 =====
db.close()
rmSync(dir, { recursive: true, force: true })
console.log(`\n===== 结果：${passed} 通过 / ${failed} 失败 =====`)
process.exit(failed ? 1 : 0)
