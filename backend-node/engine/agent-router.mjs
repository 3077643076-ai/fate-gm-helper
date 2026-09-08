// AI 助手 API 路由：/api/engine/agent/*（v0.5-B）
//   POST /run        一键收行动（查公告→标准化→LLM 兜底→登记→回执→催未交）
//   GET  /config     读 AI 配置
//   PUT  /config     写 AI 配置（保存后定时器/消息监听自动按新配置重装）
//   GET  /logs       AI 审计日志（agent_log 倒序）
//   GET  /messages   消息日志（message_log 倒序）
//   GET  /status     运行状态（定时器+消息监听）
//   POST /collector/restart  手动重连消息监听
import { Router } from 'express'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { openEngineDb } from './store.mjs'
import { collectActions, getAgentConfig, setAgentConfig, startAgentTimer, getTimerStatus, logMessage } from './agent.mjs'
import { startMessageCollector } from './qqws.mjs'

// backend 根 = engine 目录的上一级（与 router.mjs 同款推导，开发/打包两种结构都适用）
const backendRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const dbPath = process.env.FATE_GM_DB_PATH || join(backendRoot, 'data', 'gm_helper.db')
// 分发版空库：先触发主后端的业务表初始化，再开引擎表
const requireCjs = createRequire(import.meta.url)
requireCjs(join(backendRoot, 'db.js')).getDb()

const db = openEngineDb(dbPath)
const router = Router()

function requireCampaignId(source) {
  const id = Number(source)
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

// ---------- 一键收行动 ----------
router.post('/run', async (req, res) => {
  const { campaignId, round, phase, napcatBase } = req.body ?? {}
  const cid = requireCampaignId(campaignId)
  if (!cid) return res.status(400).json({ error: '需要 campaignId（战役 ID）' })
  try {
    const summary = await collectActions(db, cid, {
      round: round ?? undefined,
      phase: phase ?? undefined,
      napcatBase: napcatBase ?? getAgentConfig(db).napcatHttpBase,
    })
    res.json(summary)
  } catch (e) {
    res.status(409).json({ error: e.message })
  }
})

// ---------- 配置 ----------
router.get('/config', (_req, res) => {
  res.json(getAgentConfig(db))
})

router.put('/config', (req, res) => {
  const cfg = setAgentConfig(db, req.body ?? {})
  // 配置变化后：定时器按新配置重装；消息监听按新地址重连
  startAgentTimer(db)
  restartCollector()
  res.json(cfg)
})

// ---------- 日志查询 ----------
router.get('/logs', (req, res) => {
  const campaignId = requireCampaignId(req.query.campaignId)
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const rows = campaignId
    ? db.prepare(`SELECT * FROM agent_log WHERE campaign_id = ? ORDER BY id DESC LIMIT ?`).all(campaignId, limit)
    : db.prepare(`SELECT * FROM agent_log ORDER BY id DESC LIMIT ?`).all(limit)
  res.json(rows)
})

router.get('/messages', (req, res) => {
  const campaignId = requireCampaignId(req.query.campaignId)
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const rows = campaignId
    ? db.prepare(`SELECT id, channel, group_id, group_name, user_name, content, created_at FROM message_log WHERE campaign_id = ? OR campaign_id IS NULL ORDER BY id DESC LIMIT ?`).all(campaignId, limit)
    : db.prepare(`SELECT id, channel, group_id, group_name, user_name, content, created_at FROM message_log ORDER BY id DESC LIMIT ?`).all(limit)
  res.json(rows)
})

// ---------- 运行状态 ----------
router.get('/status', (_req, res) => {
  res.json({ timer: getTimerStatus(), collector: collector ? collector.getStatus() : { connected: false, note: '未启动' } })
})

router.post('/collector/restart', (_req, res) => {
  restartCollector()
  res.json({ ok: true, collector: collector ? collector.getStatus() : null })
})

// ---------- 消息监听（WS 旁听 NapCat，落 message_log） ----------

let collector = null

/** 从群号反查战役（群映射里第一个命中的；没配映射就记 null） */
function campaignOfGroup(groupId) {
  const row = db.prepare(`SELECT campaign_id, group_name FROM engine_group_binding WHERE group_id = ? ORDER BY id DESC LIMIT 1`).get(String(groupId))
  return row ?? null
}

/** 按配置（重新）启动消息监听 */
function restartCollector() {
  if (collector) { collector.stop(); collector = null }
  const wsUrl = getAgentConfig(db).napcatWsUrl
  if (!wsUrl) return
  collector = startMessageCollector({
    wsUrl,
    onMessage(event, text) {
      const isGroup = event.message_type === 'group'
      const groupId = String(isGroup ? event.group_id ?? '' : event.user_id ?? '')
      const binding = isGroup ? campaignOfGroup(groupId) : null
      logMessage(db, {
        campaignId: binding?.campaign_id ?? null,
        channel: event.message_type,
        groupId: isGroup ? groupId : null,
        groupName: binding?.group_name ?? null,
        userId: String(event.user_id ?? ''),
        userName: event.sender?.card || event.sender?.nickname || null,
        content: text,
        raw: event,
      })
    },
  })
}

/** 后台任务总入口（index.js 挂载后调用一次）：定时器 + 消息监听 */
export function startBackground() {
  startAgentTimer(db)
  restartCollector()
}

export default router
