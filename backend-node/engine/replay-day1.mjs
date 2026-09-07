// M1 离线回放：用第一天真实行动（节选代表性样本）驱动引擎，验证
//   行动登记 → 结算链调度 → 位置变更/魂食/奏乐/休整结算 → 账本对账 → GM 待办
// 回放数据写入正式库后自带清理（cleanup），不污染正式数据
import { openEngineDb } from '../engine/store.mjs'
import { parseAction } from '../engine/parser.mjs'
import { settleRound } from '../engine/settler.mjs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const db = openEngineDb(join(root, 'backend-node', 'data', 'gm_helper.db'))
const CAMPAIGN = 999002
const ROUND = 1

// ---------- 0. 清场（保证回放从干净状态开始） ----------
for (const t of ['engine_actions', 'engine_unit_location', 'engine_active_effects']) {
  db.prepare(`DELETE FROM ${t} WHERE campaign_id = ?`).run(CAMPAIGN)
}
db.prepare(`DELETE FROM mana_ledger WHERE role LIKE '%从' OR role LIKE '%御'`).run() // 只清引擎格式的账本

// ---------- 1. 初始化位置（跳伞落点，出自三国杯名单） ----------
const drops = [
  ['弓从', '洛阳'], ['弓御', '洛阳'], ['杀从', '白帝城'], ['杀御', '白帝城'],
  ['骑从', '白帝城'], ['骑御', '白帝城'], ['枪从', '子午谷'], ['枪御', '子午谷'],
  ['剑从', '洛阳'], ['剑御', '洛阳'], ['术从', '许都'], ['术御', '许都'],
  ['狂从', '邺城'], ['狂御', '邺城'],
]
for (const [unit, ley] of drops) {
  db.prepare(`INSERT OR REPLACE INTO engine_unit_location (campaign_id, unit_key, leyline) VALUES (?,?,?)`)
    .run(CAMPAIGN, unit, ley)
}

// ---------- 2. 行动登记（结构化输入：模拟 GM 裁决后引擎收到的指令） ----------
const register = (phase, unitKey, text) => {
  const r = parseAction(db, text, { campaignId: CAMPAIGN, round: ROUND, phase, unitKey })
  if (!r.ok) {
    console.log(`[解析失败→需裁决] ${unitKey} "${text}": ${r.message}`)
    db.prepare(`INSERT INTO engine_pending_ruling (campaign_id, round, phase, kind, context) VALUES (?,?,?,?,?)`)
      .run(CAMPAIGN, ROUND, phase, r.kind ?? 'parse_fail', `${unitKey}: ${r.message}`)
    return null
  }
  const a = r.action
  db.prepare(`
    INSERT OR REPLACE INTO engine_actions (campaign_id, round, phase, unit_key, action_key, target, variant, raw_text)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(CAMPAIGN, ROUND, phase, unitKey, a.actionKey, a.target, a.variant, a.rawText)
  console.log(`[登记] ${phase} ${unitKey}: ${a.actionKey}${a.target ? ' → ' + a.target : ''}`)
  return a
}

console.log('===== 昼间行动登记 =====')
// 真实行动（结算记录-第1天）节选 + 1 条假设机动（验证位置变更分支）
register('昼', '弓御', '奏乐')                       // 金细工师 奏乐（判定单挂 15/60）
register('昼', '弓从', '广泛侦查')                    // 效果类 → deferred
register('昼', '术从', '阵地制作')                    // 效果类 → deferred
register('昼', '狂从', '解放')                        // 开鲜血神殿（效果类 → deferred + 场上效果演示）
register('昼', '剑从', '休整')                        // 荀彧卡缺失 → GM 待办路径
register('昼', '骑从', '机动 洛阳')                   // ⚠️ 假设数据（验证位置变更+拉群待办）

// 解放鲜血神殿的场上效果（演示 active_effects 的可见性用途）
db.prepare(`
  INSERT OR REPLACE INTO engine_active_effects
    (campaign_id, effect_name, scope, owner, effect_text, started_round, expires)
  VALUES (?, '魔术结界：鲜血神殿', 'leyline:邺城', '狂从',
          '永夜；隐藏遮蔽魂食成功信息；灵脉魔力量归0', 1, '结束条件见规则原文')
`).run(CAMPAIGN)

// 昼间判定单（玩家手投的真实出目）
db.prepare(`INSERT INTO judgment_ticket (session_id, role, action_name, target, status, roll) VALUES (?, ?, ?, ?, 'attached', ?)`)
  .run('replay', '弓御', '奏乐', 60, 15)

console.log('\n===== 推进 昼 =====')
const day = settleRound(db, CAMPAIGN, ROUND, '昼')
day.report.forEach(l => console.log('  ' + l))
day.todos.forEach(l => console.log('  [GM待办] ' + l))
day.errors.forEach(l => console.log('  [错误] ' + l))

console.log('\n===== 夜间行动登记 =====')
register('夜', '弓从', '奏乐')                       // 星下冥 奏乐（挂 10/60）
register('夜', '弓御', '奏乐')                       // 金细工师 夜再奏（挂 15/60）
register('夜', '狂从', '魂食')                       // 隐蔽魂食（M1 按普通魂食出数，遮断判定 M2）
register('夜', '骑从', '休整')
register('夜', '剑从', '休整')

// 夜间判定单
const insTicket = db.prepare(`INSERT INTO judgment_ticket (session_id, role, action_name, target, status, roll) VALUES (?, ?, ?, ?, 'attached', ?)`)
insTicket.run('replay', '弓从', '奏乐', 60, 10)
insTicket.run('replay', '弓御', '奏乐', 60, 15)

console.log('\n===== 推进 夜 =====')
const night = settleRound(db, CAMPAIGN, ROUND, '夜')
night.report.forEach(l => console.log('  ' + l))
night.todos.forEach(l => console.log('  [GM待办] ' + l))
night.errors.forEach(l => console.log('  [错误] ' + l))

console.log('\n===== 对账：引擎视角魔力合计 =====')
for (const t of [...day.totals, ...night.totals.filter(n => !day.totals.some(d => d.role === n.role))]) {
  console.log(`  ${t.role}: ${t.total > 0 ? '+' : ''}${t.total}（${t.n} 笔）`)
}

console.log('\n===== 场上生效效果 =====')
for (const e of db.prepare(`SELECT effect_name, scope, owner FROM engine_active_effects WHERE campaign_id = ?`).all(CAMPAIGN)) {
  console.log(`  ${e.effect_name} @ ${e.scope}（发起:${e.owner}）`)
}

// ---------- 3. 清理（回放数据不留在正式库） ----------
for (const t of ['engine_actions', 'engine_unit_location', 'engine_active_effects']) {
  db.prepare(`DELETE FROM ${t} WHERE campaign_id = ?`).run(CAMPAIGN)
}
db.prepare(`DELETE FROM mana_ledger WHERE source = '行动' OR source = '判定'`).run()
db.prepare(`DELETE FROM judgment_ticket WHERE session_id = 'replay'`).run()
console.log('\n（回放数据已清理）')
