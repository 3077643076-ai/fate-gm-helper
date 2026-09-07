// lib/ledger.mjs —— 魔力账本：记账 + 汇总
// 定位（SOP 3.3 / 3.3.1）：每一笔魔力变动立即入库，结算时按流水汇总对账。
// 数字必须来自原文或判定结果；AI 只登记事实，不心算合计。
import { openDb } from './store.mjs'

const DETAIL_ROWS_PER_ROLE = 10   // 汇总时每个角色最多列出的近期流水条数

/** 记一笔魔力变动流水 */
export function record(config = {}, args = {}) {
  const role = String(args.role ?? '').trim()
  const delta = Number(args.delta)
  const reason = String(args.reason ?? '').trim()
  if (!role) return { text: '记账失败：缺角色（role）。' }
  if (!Number.isFinite(delta) || delta === 0) return { text: '记账失败：变动量（delta）必须是非零数字。' }
  if (!reason) return { text: '记账失败：缺事由（reason）——每笔流水必须写清为什么。' }

  const db = openDb(config)
  db.prepare(
    `INSERT INTO mana_ledger (role, delta, reason, source, round, phase)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(role, Math.trunc(delta), reason, args.source ? String(args.source) : null, args.round ?? null, args.phase ? String(args.phase) : null)

  return {
    text: `已记账：${role} ${delta > 0 ? '+' : ''}${Math.trunc(delta)}（${reason}${args.source ? '，来源:' + args.source : ''}${args.round ? '，第' + args.round + '天' : ''}${args.phase ? args.phase : ''}）。可用 gm_ledger_summarize 核对。`,
  }
}

/** 汇总：按角色合计 + 每角色近期流水明细（对账用） */
export function summarize(config = {}, role = '') {
  const db = openDb(config)

  // 合计：只汇总指定角色（或全部）
  const totals = role
    ? db.prepare(`SELECT role, SUM(delta) AS total, COUNT(*) AS entries FROM mana_ledger WHERE role LIKE ? GROUP BY role`).all(`%${role}%`)
    : db.prepare(`SELECT role, SUM(delta) AS total, COUNT(*) AS entries FROM mana_ledger GROUP BY role ORDER BY role`).all()

  if (totals.length === 0) return { text: `账本里没有${role ? `匹配"${role}"的` : ''}流水。` }

  const parts = ['魔力账本汇总（合计 = 本表所有流水之和；上限口径见 SOP 3.3.1，上限不由账本决定）：']
  for (const total of totals) {
    parts.push(`\n■ ${total.role}：合计 ${total.total > 0 ? '+' : ''}${total.total}（${total.entries} 笔）`)
    const details = db
      .prepare(`SELECT delta, reason, source, round, phase, created_at FROM mana_ledger WHERE role = ? ORDER BY id DESC LIMIT ?`)
      .all(total.role, DETAIL_ROWS_PER_ROLE)
    for (const detail of details.reverse()) {
      const tag = [detail.round != null ? `第${detail.round}天` : '', detail.phase ?? '', detail.source ?? ''].filter(Boolean).join('/')
      parts.push(`  ${detail.created_at} ${detail.delta > 0 ? '+' : ''}${detail.delta} ${detail.reason}${tag ? `（${tag}）` : ''}`)
    }
    if (total.entries > DETAIL_ROWS_PER_ROLE) {
      parts.push(`  …（其余 ${total.entries - DETAIL_ROWS_PER_ROLE} 笔略）`)
    }
  }

  parts.push('\n对账提醒：账本合计是"流水之和"，角色当前魔力若与它不一致 → 停止播报，列出差异交 GM 裁决（SOP 3.5）。')
  return { text: parts.join('\n') }
}
