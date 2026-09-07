// lib/ticket.mjs —— 判定单：投点登记制的数据载体（SOP 3.4b）
// 规则：先立单后投点；投点必须挂单；同一判定取最早的确定投点（锁定后拒改）；
//       无单骰子=无效投点；作废需留痕不删除。
import { openDb } from './store.mjs'

function ensureTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS judgment_ticket (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      action_name TEXT NOT NULL,
      target INTEGER,
      status TEXT NOT NULL DEFAULT 'open',
      roll INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT
    );
  `)
}

/** 立单：角色 + 行动名 + 目标值 → 判定单（open） */
function create(config, sessionId, args) {
  const role = String(args.role ?? '').trim()
  const actionName = String(args.actionName ?? '').trim()
  if (!role || !actionName) return { text: '立单失败：需要 role（角色，主/从明确）和 actionName（行动名）。' }
  const target = Number.isFinite(Number(args.target)) ? Number(args.target) : null
  const db = openDb(config)
  ensureTable(db)
  const result = db.prepare(
    `INSERT INTO judgment_ticket (session_id, role, action_name, target) VALUES (?,?,?,?)`
  ).run(sessionId, role, actionName, target)
  return { text: `判定单 #${result.lastInsertRowid} 已立：${role} · ${actionName} · 目标${target ?? '?'}`} 
}

/** 列出当前会话的全部判定单（open 优先在前） */
function list(config, sessionId) {
  const db = openDb(config)
  ensureTable(db)
  const rows = db.prepare(
    `SELECT id, role, action_name, target, status, roll FROM judgment_ticket
      WHERE session_id = ? ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, id`
  ).all(sessionId)
  if (rows.length === 0) return { text: '本会话暂无判定单。行动需要判定时先 create 立单，玩家投点后再 attach 挂点。' }
  const lines = rows.map(r =>
    `#${r.id} [${r.status}] ${r.role} · ${r.action_name} · 目标${r.target ?? '?'}${r.roll != null ? ` · 出目${r.roll}` : ''}`
  )
  return { text: `本会话判定单：\n${lines.join('\n')}\n\n投点后用 attach 挂单；无单骰子=无效投点。` }
}

/** 挂点：把出目挂到指定判定单。已挂过（最早确定投点）则拒绝覆盖 */
function attach(config, sessionId, args) {
  const ticketId = Number(args.ticketId)
  const roll = Number(args.roll)
  if (!Number.isInteger(ticketId)) return { text: '挂点失败：需要 ticketId（判定单编号）。' }
  if (!Number.isFinite(roll)) return { text: '挂点失败：需要 roll（骰子出目）。' }
  const db = openDb(config)
  ensureTable(db)
  const ticket = db.prepare(`SELECT * FROM judgment_ticket WHERE id = ? AND session_id = ?`).get(ticketId, sessionId)
  if (!ticket) return { text: `挂点失败：本会话找不到判定单 #${ticketId}（用 list 查看）。` }
  if (ticket.roll != null) {
    return { text: `#${ticketId} 已有最早的确定投点（${ticket.roll}），按 SOP 取最早投点，拒绝覆盖。如确需重投请 GM 同意后 void 作废再立新单。` }
  }
  db.prepare(`UPDATE judgment_ticket SET roll = ?, status = 'attached', updated_at = datetime('now','localtime') WHERE id = ?`)
    .run(Math.trunc(roll), ticketId)
  const verdict = ticket.target != null ? (Math.trunc(roll) <= ticket.target ? '✅ 过' : '❌ 未过') : ''
  return { text: `#${ticketId} ${ticket.role} · ${ticket.action_name}：出目 ${Math.trunc(roll)}/${ticket.target ?? '?'} ${verdict}`.trim() }
}

/** 作废：留痕（status=void），不删除 */
function voidTicket(config, sessionId, args) {
  const ticketId = Number(args.ticketId)
  if (!Number.isInteger(ticketId)) return { text: '作废失败：需要 ticketId。' }
  const db = openDb(config)
  ensureTable(db)
  const result = db.prepare(
    `UPDATE judgment_ticket SET status = 'void', updated_at = datetime('now','localtime')
      WHERE id = ? AND session_id = ? AND status != 'void'`
  ).run(ticketId, sessionId)
  if (result.changes === 0) return { text: `作废失败：本会话找不到可作废的判定单 #${ticketId}。` }
  return { text: `#${ticketId} 已作废（留痕保留）。` }
}

/** 工具入口：按 action 分发 */
export function ticket(config, sessionId, args = {}) {
  switch (String(args.action ?? 'list')) {
    case 'create': return create(config, sessionId, args)
    case 'attach': return attach(config, sessionId, args)
    case 'void': return voidTicket(config, sessionId, args)
    case 'list': default: return list(config, sessionId)
  }
}
