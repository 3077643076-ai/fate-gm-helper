// 引擎 API 路由：/api/engine/*
// 消费方：fate-actions 插件（QQ 指令）/ 网页引擎面板（规划中）/ 离线回放
import { Router } from 'express'
import { openEngineDb } from './store.mjs'
import { parseAction } from './parser.mjs'
import { settleRound } from './settler.mjs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

// backend 根 = engine 目录的上一级——开发与打包两种目录结构下 db.js 都在这里
//（开发：<root>/backend-node/engine → <root>/backend-node；打包：<res>/backend/engine → <res>/backend）
const backendRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const dbPath = process.env.FATE_GM_DB_PATH || join(backendRoot, 'data', 'gm_helper.db')

// 分发版空库：先触发主后端的业务表初始化（campaign 等表），再开引擎表
const requireCjs = createRequire(import.meta.url)
requireCjs(join(backendRoot, 'db.js')).getDb()

const db = openEngineDb(dbPath)

const router = Router()

/** campaignId 必传校验（引擎是多战役通用的，绝不默认到某个杯） */
function requireCampaignId(source) {
  const id = Number(source)
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

/** 当前时段推断：取最后一个 OPEN 回合的最大轮次（无则 1 昼） */
function currentRound(campaignId) {
  const row = db.prepare(`SELECT MAX(turn_number) AS n FROM campaign_round WHERE campaign_id = ? AND status = 'OPEN'`).get(campaignId)
  return row?.n ?? 1
}

// ---------- 状态：位置/生效效果/行动/需裁决/判定单一屏 ----------
router.get('/status', (req, res) => {
  const campaignId = requireCampaignId(req.query.campaignId)
  if (!campaignId) return res.status(400).json({ error: '需要 campaignId（战役 ID）' })
  const round = Number(req.query.round) || currentRound(campaignId)
  const phase = req.query.phase || '昼'
  res.json({
    round,
    phase,
    locations: db.prepare(`SELECT unit_key, leyline FROM engine_unit_location WHERE campaign_id = ? ORDER BY unit_key`).all(campaignId),
    activeEffects: db.prepare(`SELECT effect_name, scope, owner, expires FROM engine_active_effects WHERE campaign_id = ?`).all(campaignId),
    actions: db.prepare(`SELECT unit_key, action_key, target, status, settle_note FROM engine_actions WHERE campaign_id = ? AND round = ? AND phase = ? ORDER BY id`).all(campaignId, round, phase),
    pendingRulings: db.prepare(`SELECT id, kind, context, ai_guess FROM engine_pending_ruling WHERE campaign_id = ? AND status = 'open'`).all(campaignId),
    openTickets: db.prepare(`SELECT id, role, action_name, target FROM judgment_ticket WHERE status = 'open'`).all(),
  })
})

// ---------- 登记行动：文本 → parser → 入库（解析失败自动进需裁决） ----------
router.post('/actions', (req, res) => {
  const { campaignId, round, phase = '昼', unitKey, text } = req.body ?? {}
  if (!requireCampaignId(campaignId)) return res.status(400).json({ error: '需要 campaignId（战役 ID）' })
  if (!unitKey || !text) return res.status(400).json({ error: '需要 unitKey 和 text' })
  const r = parseAction(db, text, { campaignId, round: round ?? currentRound(campaignId), phase, unitKey })
  if (!r.ok) {
    const info = db.prepare(
      `INSERT INTO engine_pending_ruling (campaign_id, round, phase, kind, context) VALUES (?,?,?,?,?)`
    ).run(campaignId, round ?? currentRound(campaignId), phase, r.kind ?? 'parse_fail', `${unitKey}: ${r.message}`)
    return res.status(422).json({ error: r.message, pendingRulingId: info.lastInsertRowid })
  }
  const a = r.action
  try {
    const result = db.prepare(`
      INSERT INTO engine_actions (campaign_id, round, phase, unit_key, action_key, target, variant, raw_text)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(a.campaignId, a.round, a.phase, a.unitKey, a.actionKey, a.target, a.variant, a.rawText)
    res.json({ ok: true, id: result.lastInsertRowid, actionKey: a.actionKey, target: a.target, variant: a.variant })
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: `${unitKey} 本时段已有行动（可先 void 原行动）` })
    }
    throw e
  }
})

// ---------- 移除已登记行动（void 留痕，结算时跳过） ----------
router.delete('/actions/:id', (req, res) => {
  const r = db.prepare(`UPDATE engine_actions SET status = 'void' WHERE id = ? AND status IN ('declared','deferred')`).run(req.params.id)
  if (r.changes === 0) return res.status(404).json({ error: `行动 #${req.params.id} 不存在或已结算` })
  res.json({ ok: true })
})

// ---------- 推进：前置检查 → 结算 → 报告 ----------
router.post('/advance', (req, res) => {
  const { campaignId, round, phase = '昼' } = req.body ?? {}
  if (!requireCampaignId(campaignId)) return res.status(400).json({ error: '需要 campaignId（战役 ID）' })
  const result = settleRound(db, campaignId, round ?? currentRound(campaignId), phase)
  const code = result.ok ? 200 : 409
  res.status(code).json(result)
})

// ---------- 需裁决：列表 / 裁决 ----------
router.get('/rulings', (req, res) => {
  const campaignId = requireCampaignId(req.query.campaignId)
  if (!campaignId) return res.status(400).json({ error: '需要 campaignId（战役 ID）' })
  res.json(db.prepare(`SELECT * FROM engine_pending_ruling WHERE campaign_id = ? AND status = 'open'`).all(campaignId))
})
router.post('/rulings/resolve', (req, res) => {
  const { id, resolution } = req.body ?? {}
  if (!id || !resolution) return res.status(400).json({ error: '需要 id 和 resolution' })
  const r = db.prepare(`UPDATE engine_pending_ruling SET status='resolved', resolution=?, resolved_at=datetime('now','localtime') WHERE id=? AND status='open'`).run(resolution, id)
  if (r.changes === 0) return res.status(404).json({ error: `需裁决项 #${id} 不存在或已关闭` })
  res.json({ ok: true })
})

// ---------- 判定单（引擎侧只读+挂点；立单走 QQ 工具/网页） ----------
router.get('/tickets', (req, res) => {
  res.json(db.prepare(`SELECT id, session_id, role, action_name, target, status, roll FROM judgment_ticket ORDER BY id DESC LIMIT 50`).all())
})
router.post('/tickets/attach', (req, res) => {
  const { id, roll } = req.body ?? {}
  if (!id || !Number.isFinite(Number(roll))) return res.status(400).json({ error: '需要 id 和 roll' })
  const ticket = db.prepare(`SELECT * FROM judgment_ticket WHERE id = ?`).get(id)
  if (!ticket) return res.status(404).json({ error: `判定单 #${id} 不存在` })
  if (ticket.roll != null) return res.status(409).json({ error: `#${id} 已有最早确定投点（${ticket.roll}），拒绝覆盖` })
  db.prepare(`UPDATE judgment_ticket SET roll=?, status='attached' WHERE id=?`).run(Math.trunc(Number(roll)), id)
  const verdict = ticket.target != null ? (Math.trunc(Number(roll)) <= ticket.target ? '过' : '未过') : ''
  res.json({ ok: true, verdict })
})

export default router
