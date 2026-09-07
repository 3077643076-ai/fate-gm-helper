// 引擎结算器：时段推进 = 前置检查 → 结算链调度 → 逐项结算 → 对账 → 输出
// M1 范围：机动(位置变更+GM拉群待办) / 魂食(人流+账本) / 奏乐(判定挂单回填+账本+buff)
//          休整(御主回路供魔) / 其余行动登记为 deferred(效果结算 M2)
// 原则：纯函数思路——输入状态+行动，输出 { 结果, 播报文本, GM待办, 账本变动 }；
//       写库集中在少数明确的出口。
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// 结算链顺序（判例口径：机动-魂食-干涉-解放-制造-信息-休整-摧毁工房）
const CHAIN_ORDER = ['机动', '魂食', '干涉', '解放', '制造', '信息', '休整', '摧毁工房']
function chainRank(actionKey, phase) {
  if (phase === '灵脉行动') return 90 // 奏乐/征兵/托孤等灵脉行动：行动执行时判定，链尾统一处理
  const idx = CHAIN_ORDER.indexOf(actionKey)
  return idx === -1 ? 50 : idx * 10
}

/** 前置检查：判定单未挂点 / 需裁决未关闭 → 拒绝推进 */
export function preCheck(db, campaignId, round, phase) {
  const blockers = []
  const openTickets = db.prepare(
    `SELECT id, role, action_name FROM judgment_ticket WHERE status = 'open'`
  ).all()
  if (openTickets.length) {
    blockers.push(`判定单未挂点：${openTickets.map(t => `#${t.id} ${t.role}·${t.action_name}`).join('，')}`)
  }
  const openRulings = db.prepare(
    `SELECT id, context FROM engine_pending_ruling WHERE status = 'open' AND campaign_id = ?`
  ).all(campaignId)
  if (openRulings.length) {
    blockers.push(`需裁决未关闭：${openRulings.map(r => `#${r.id} ${r.context.slice(0, 30)}`).join('；')}`)
  }
  return { ok: blockers.length === 0, blockers }
}

/** 取本时段全部已宣言行动，按结算链排序 */
function loadActions(db, campaignId, round, phase) {
  const rows = db.prepare(
    `SELECT id, unit_key, action_key, target, variant, raw_text, status, settle_note
       FROM engine_actions
      WHERE campaign_id = ? AND round = ? AND phase = ? AND status IN ('declared','deferred')
      ORDER BY id`
  ).all(campaignId, round, phase)
  return rows
    .map(row => ({ ...row, rule: db.prepare(`SELECT * FROM action_rules WHERE action_key = ?`).get(row.action_key) }))
    .sort((a, b) => chainRank(a.actionKey, a.rule?.phase) - chainRank(b.actionKey, b.rule?.phase) || a.id - b.id)
}

/** 单位键 → 当前灵脉（无记录时返回 null，由回放/初始化写入落点） */
function locationOf(db, campaignId, unitKey) {
  const row = db.prepare(`SELECT leyline FROM engine_unit_location WHERE campaign_id = ? AND unit_key = ?`)
    .get(campaignId, unitKey)
  return row?.leyline ?? null
}

/** 记一笔 GM 待办（拉群/移群等人工操作） */
function addTodo(todos, text) {
  todos.push(text)
}

/**
 * 时段推进主函数
 * @returns {object} { ok, blockers, report(播报文本[]), todos(GM待办[]), ledgerNotes(账本变动[]), errors }
 */
export function settleRound(db, campaignId, round, phase) {
  const pre = preCheck(db, campaignId, round, phase)
  if (!pre.ok) return { ok: false, blockers: pre.blockers, report: [], todos: [], ledgerNotes: [], errors: [] }

  const actions = loadActions(db, campaignId, round, phase)
  const report = []      // 播报文本（按结算顺序）
  const todos = []       // GM 待办（拉群/移群/补数据）
  const ledgerNotes = [] // 账本变动 { role, delta, reason, source }
  const errors = []

  const markSettled = (id, note) =>
    db.prepare(`UPDATE engine_actions SET status = 'settled', settle_note = ? WHERE id = ?`).run(note, id)
  const markDeferred = (id, note) =>
    db.prepare(`UPDATE engine_actions SET status = 'deferred', settle_note = ? WHERE id = ?`).run(note, id)

  for (const act of actions) {
    const { id, unit_key: unitKey, action_key: key, target, variant } = act
    const where = locationOf(db, campaignId, unitKey) ?? '（位置未知）'

    try {
      switch (key) {
        // ---------- 机动：位置变更 + 拉群待办 ----------
        case '机动': {
          if (!target) { errors.push(`[${unitKey}] 机动缺目标灵脉`); break }
          db.prepare(`UPDATE engine_unit_location SET leyline = ?, updated_at = datetime('now','localtime') WHERE campaign_id = ? AND unit_key = ?`)
            .run(target, campaignId, unitKey)
          addTodo(todos, `【拉群】请将 ${unitKey} 拉入【${target}】灵脉群（原：【${where}】）`)
          markSettled(id, `机动 ${where} → ${target}（已更新位置，待 GM 拉群）`)
          report.push(`[${unitKey}] 机动：${where} → ${target}`)
          break
        }

        // ---------- 魂食（含变体；M1 统一按"人流-1、+60"出数，判定/变体细则 M2） ----------
        case '魂食': {
          const v = variant ?? '普通'
          const ley = where === '（位置未知）' ? null : where
          if (!ley) { errors.push(`[${unitKey}] 魂食缺位置`); break }
          const leyRow = db.prepare(`SELECT population_flow, mana_amount FROM leyline WHERE campaign_id = ? AND name = ?`).get(campaignId, ley)
          if (leyRow && leyRow.population_flow <= 0) {
            markSettled(id, `魂食失败：${ley} 人流量为 0`)
            report.push(`[${unitKey}] 魂食失败：${ley} 人流量为 0`)
            break
          }
          if (leyRow) {
            db.prepare(`UPDATE leyline SET population_flow = population_flow - 1 WHERE campaign_id = ? AND name = ?`).run(campaignId, ley)
          }
          ledgerNotes.push({ role: unitKey, delta: 60, reason: `魂食(${v})@${ley}`, source: '行动' })
          markSettled(id, `魂食(${v})@${ley}：人流-1，+60（遮断判定细则 M2）`)
          report.push(`[${unitKey}] 魂食(${v})@${ley}：人流-1，魔力+60`)
          break
        }

        // ---------- 奏乐：判定单驱动（玩家手投挂单后此处读结果） ----------
        case '奏乐': {
          // 找该单位本时段的奏乐判定单（已挂点）
          const ticket = db.prepare(
            `SELECT roll FROM judgment_ticket WHERE status = 'attached' AND role = ? AND action_name LIKE '%奏乐%'`
          ).get(unitKey)
          if (!ticket) {
            markDeferred(id, '奏乐：等待判定单挂点（玩家手投）')
            report.push(`[${unitKey}] 奏乐：待判定（判定单未挂点）`)
            break
          }
          const roll = ticket.roll
          const ley = where
          if (ley !== '洛阳') { markSettled(id, `奏乐无效：不在洛阳（当前 ${ley}）`); report.push(`[${unitKey}] 奏乐无效：不在洛阳`); break }
          const success = roll <= 60
          const crit = roll === 100
          const gain = crit ? 60 : 30
          const layers = crit ? 2 : 1
          ledgerNotes.push({ role: unitKey, delta: gain, reason: `洛阳奏乐成功(出目${roll})`, source: '判定' })
          // 乐不思蜀 buff 入生效效果
          db.prepare(`
            INSERT INTO engine_active_effects (campaign_id, effect_name, scope, owner, effect_text, started_round, expires)
            VALUES (?, '乐不思蜀', ?, ?, '每层+20%胜率；离开洛阳全部失去', ?, '离开洛阳时失去')
            ON CONFLICT(campaign_id, effect_name, scope, owner) DO NOTHING
          `).run(campaignId, `unit:${unitKey}`, unitKey, round)
          markSettled(id, `奏乐 出目${roll}/60 ✅ +${gain}魔 +乐不思蜀${layers}层`)
          report.push(`[${unitKey}] 奏乐 出目${roll}/60 成功：魔力+${gain}，乐不思蜀+${layers}层`)
          break
        }

        // ---------- 休整：从者获=御主回路（经 unit_registry 精确查御主卡） ----------
        case '休整': {
          const masterClass = unitKey.replace(/从$/, '御')
          const masterCard = db.prepare(`
            SELECT cc.total_mana, cc.code FROM unit_registry ur
              JOIN character_card cc ON cc.id = ur.card_id
             WHERE ur.unit_key = ?`).get(masterClass)
          if (!masterCard || masterCard.total_mana == null) {
            markDeferred(id, `休整：御主（${masterClass}）卡缺失或回路未知，供魔待补`)
            report.push(`[${unitKey}] 休整：御主卡缺失，供魔待补`)
            addTodo(todos, `【补数据】${unitKey} 休整需要御主回路值（御主卡缺失）`)
            break
          }
          const gain = masterCard.total_mana
          ledgerNotes.push({ role: unitKey, delta: gain, reason: `休整(${masterCard.code} 回路)`, source: '行动' })
          markSettled(id, `休整：从者 +${gain}（御主回路）`)
          report.push(`[${unitKey}] 休整：魔力+${gain}`)
          break
        }

        // ---------- 效果类行动：M1 登记延后（技能/宝具联动 = M2） ----------
        default: {
          markDeferred(id, `已登记：效果结算待技能模板库（M2）[${key}${target ? ' → ' + target : ''}]`)
          report.push(`[${unitKey}] ${key}${target ? ' → ' + target : ''}：已登记（效果结算 M2）`)
        }
      }
    } catch (e) {
      errors.push(`[${unitKey}] ${key} 结算异常：${e.message}`)
    }
  }

  // ---------- 账本落账（引擎产出的变动统一写入流水） ----------
  const insertLedger = db.prepare(
    `INSERT INTO mana_ledger (role, delta, reason, source, round, phase) VALUES (?,?,?,?,?,?)`
  )
  for (const n of ledgerNotes) {
    insertLedger.run(n.role, n.delta, n.reason, n.source ?? '引擎', round, phase)
  }

  // ---------- 对账：账本合计（引擎视角当前魔力） ----------
  const totals = db.prepare(`SELECT role, SUM(delta) AS total, COUNT(*) AS n FROM mana_ledger GROUP BY role ORDER BY role`).all()

  return { ok: true, blockers: [], report, todos, ledgerNotes, errors, totals }
}
