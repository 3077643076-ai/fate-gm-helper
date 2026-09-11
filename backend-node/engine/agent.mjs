// AI 助手（v0.5-B 方案）：程序编排骨架 + LLM 在固定接缝填空
//
// 职责边界（程序级约束，不是提示词）：
//   1. AI 只跑"收行动"工作流：查公告 → 标准化 → LLM 兜底解析 → 登记 → 私组确认回执 → 催未交
//   2. 推进（advance）等改账本的操作不归 AI——v0.5 明确不给，错了不是发错消息是改错账
//   3. 所有外发文本必过出口闸（exitgate：真名替换 + 渠道白名单）
//   4. 所有动作进 agent_log 审计；LLM 调用有 token 预算，超了自动停用兜底
//   5. 公告按内容 hash 幂等：同一条公告重复跑不会重复登记
//
// LLM 只在两个位置出现（接缝固定）：
//   - 纯规则解析失败的片段 → LLM 给结构化行动建议（动词白名单校验后才入库）
//   - 校验不过 / LLM 不可用 → 照旧进需裁决队列，等 GM 拍板
import { createHash } from 'node:crypto'
import { standardizeAnnouncement } from './parser.mjs'
import { parseWithLLM } from './llm.mjs'
import { fetchGroupNotices, sendGroupMsg } from './qqport.mjs'
import { screenOutbound } from './exitgate.mjs'

// ---------- 配置（KV 表，面板可改，重启仍生效） ----------

const CONFIG_DEFAULTS = {
  agentEnabled: '0',          // 定时收行动总开关（1=开）
  agentIntervalMinutes: '30', // 定时间隔（分钟，最小 5）
  agentLlmEnabled: '1',       // LLM 兜底开关（关了就纯规则，解析失败全进需裁决）
  agentTokenBudget: '20000',  // 单次运行的 LLM token 预算
  agentCampaignId: '',        // 定时收行动的目标战役
  agentPhase: '昼',           // 默认时段（公告头里有时段时以公告为准）
  napcatHttpBase: '',         // NapCat HTTP 地址（发消息/读公告用）
  napcatWsUrl: '',            // NapCat WS 地址（收群消息入日志用）
}

/** 读配置（缺省值兜底） */
export function getAgentConfig(db) {
  const rows = db.prepare(`SELECT key, value FROM agent_config`).all()
  const cfg = { ...CONFIG_DEFAULTS }
  for (const r of rows) cfg[r.key] = r.value ?? ''
  return cfg
}

/** 写配置（只更新传入的键） */
export function setAgentConfig(db, patch = {}) {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in CONFIG_DEFAULTS)) continue // 白名单外的键不收
    db.prepare(`
      INSERT INTO agent_config (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now','localtime')
    `).run(key, String(value ?? ''))
  }
  return getAgentConfig(db)
}

// ---------- 审计与消息日志 ----------

/** 写一条 AI 审计日志 */
export function logAgent(db, runId, campaignId, step, target, ok, detail, tokens = 0) {
  db.prepare(`
    INSERT INTO agent_log (campaign_id, run_id, step, target, ok, detail, tokens)
    VALUES (?,?,?,?,?,?,?)
  `).run(campaignId, runId, step, target ?? '', ok ? 1 : 0, detail ? JSON.stringify(detail) : null, tokens)
}

/** 写一条消息日志（公告/群聊/AI 外发） */
export function logMessage(db, { campaignId = null, channel, groupId = null, groupName = null, userId = null, userName = null, content, raw = null }) {
  db.prepare(`
    INSERT INTO message_log (campaign_id, channel, group_id, group_name, user_id, user_name, content, text_hash, raw)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(campaignId, channel, groupId, groupName, userId, userName, String(content ?? ''), textHash(content), raw ? JSON.stringify(raw).slice(0, 4000) : null)
}

/** 内容摘要（公告幂等去重用） */
export function textHash(text) {
  return createHash('sha1').update(String(text ?? '').trim()).digest('hex').slice(0, 12)
}

// ---------- 公告文本的小工具 ----------

/** 中文数字 → 阿拉伯数字（只处理"第一/二/…/十"这种公告头里会出现的小数字） */
function cnNumberToInt(s) {
  const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
  if (/^\d+$/.test(s)) return Number(s)
  if (map[s]) return map[s]
  return null
}

/**
 * 从公告头识别时段（"第1天昼"/"第一天夜"/"day2昼"）
 * @returns {{round: number, phase: string} | null}
 */
export function extractTimeHeader(text) {
  const m = String(text ?? '').match(/第\s*([0-9一二三四五十]+)\s*[天日]\s*(昼|夜)?|day\s*(\d+)\s*(昼|夜)?/i)
  if (!m) return null
  const round = cnNumberToInt(m[1] ?? m[3])
  const phase = m[2] ?? m[4] ?? null
  if (round == null && !phase) return null
  return { round: round ?? null, phase: phase ?? null }
}

/**
 * 按"从者：/御主："前缀把公告拆成角色段
 * 纯时段头段（"第2天昼"这类，去掉后没实际内容）直接丢弃，不当行动解析
 * @returns {Array<{role: '从者'|'御主'|null, part: string}>}
 */
export function splitByRole(text) {
  const t = String(text ?? '')
  const re = /(从者|御主)\s*[:：]?\s*/g
  const parts = []
  let last = 0
  let lastRole = null
  let m
  const pushPart = (role, part) => {
    const cleaned = part.trim()
    if (!cleaned) return
    // 去掉时段头和分隔符后没内容 = 纯头段，跳过
    const bodyOnly = cleaned.replace(/第\s*[0-9一二三四五十]+\s*[天日]\s*(昼|夜)?/gi, '').replace(/[|\s]/g, '')
    if (!bodyOnly) return
    parts.push({ role, part: cleaned })
  }
  while ((m = re.exec(t)) !== null) {
    pushPart(lastRole, t.slice(last, m.index))
    lastRole = m[1]
    last = m.index + m[0].length
  }
  pushPart(lastRole, t.slice(last))
  return parts
}

// ---------- 登记辅助 ----------

/** 当前回合推断（与 router.mjs 同口径：最后一个 OPEN 回合；没有就 1） */
function currentRoundOf(db, campaignId) {
  const row = db.prepare(`SELECT MAX(turn_number) AS n FROM campaign_round WHERE campaign_id = ? AND status = 'OPEN'`).get(campaignId)
  return row?.n ?? 1
}

/** 登记一条行动（slot 自动递增；与 /api/engine/actions 同款逻辑） */
function insertAction(db, campaignId, round, phase, unitKey, actionKey, target, variant, rawText) {
  const slotRow = db.prepare(
    `SELECT COALESCE(MAX(slot), 0) + 1 AS next FROM engine_actions
      WHERE campaign_id = ? AND round = ? AND phase = ? AND unit_key = ?`
  ).get(campaignId, round, phase, unitKey)
  const r = db.prepare(`
    INSERT INTO engine_actions (campaign_id, round, phase, unit_key, slot, action_key, target, variant, raw_text)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(campaignId, round, phase, unitKey, slotRow.next, actionKey, target, variant, rawText)
  return r.lastInsertRowid
}

/** 查重：同一时段同一单位已有完全相同的非 void 登记（防公告重复提交/面板+助手双登记） */
function hasDuplicateAction(db, campaignId, round, phase, unitKey, actionKey, target, rawText) {
  const row = db.prepare(`
    SELECT id FROM engine_actions
     WHERE campaign_id = ? AND round = ? AND phase = ? AND unit_key = ?
       AND action_key = ? AND IFNULL(target,'') = IFNULL(?, '')
       AND IFNULL(raw_text,'') = IFNULL(?, '')
       AND status != 'void'
     LIMIT 1
  `).get(campaignId, round, phase, unitKey, actionKey, target, rawText)
  return !!row
}

// ---------- 收行动工作流 ----------

/**
 * 跑一遍"收行动"：查各私组公告 → 标准化登记 → LLM 兜底 → 确认回执 → 催未交
 * @param {object} [opts] round/phase/napcatBase 可覆盖；ports 可注入（测试用）
 * @returns {object} summary 运行摘要（面板展示用）
 */
export async function collectActions(db, campaignId, opts = {}) {
  const runId = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '-' + Math.random().toString(36).slice(2, 6)
  const cfg = opts.config ?? getAgentConfig(db)
  const napcatBase = opts.napcatBase ?? cfg.napcatHttpBase
  const ports = opts.ports ?? {
    fetchNotices: (base, gid) => fetchGroupNotices(base, gid),
    sendMsg: (base, gid, text) => sendGroupMsg(base, gid, text),
  }

  const groups = db.prepare(
    `SELECT group_id, group_name, class FROM engine_group_binding
      WHERE campaign_id = ? AND kind = 'private' ORDER BY class`
  ).all(campaignId)
  if (!groups.length) throw new Error('本战役没有登记私组群映射（先在面板配置群映射）')
  if (!napcatBase) throw new Error('未配置 NapCat HTTP 地址（agent 配置 napcatHttpBase）')

  const budget = Number(cfg.agentTokenBudget) || 20000
  let tokens = 0
  const rows = []

  for (const g of groups) {
    const row = {
      class: g.class ?? g.group_name ?? g.group_id,
      groupId: g.group_id,
      submitted: false,
      hashSkipped: false,
      registered: 0,
      duplicates: 0,
      llmUsed: 0,
      rulings: 0,
      confirmed: false,
      reminded: false,
      gateHits: 0,
      error: null,
    }
    rows.push(row)
    try {
      // 1) 读最新公告
      const notices = await ports.fetchNotices(napcatBase, g.group_id)
      const latest = notices[0] ?? null
      const text = latest?.text ?? ''
      logMessage(db, { campaignId, channel: 'notice', groupId: g.group_id, groupName: g.group_name, content: text })
      if (!text) continue // 未交，留给最后催办
      row.submitted = true

      // 2) 幂等：同一条公告（hash 相同 + 同时段）处理过就跳过登记
      const hash = textHash(text)
      const header = extractTimeHeader(text)
      const round = opts.round ?? header?.round ?? currentRoundOf(db, campaignId)
      const phase = opts.phase ?? header?.phase ?? cfg.agentPhase ?? '昼'

      // 2a) 真·hash 跳过：同群同 hash 的公告登记过 → 整组跳过（此前标记只写不读，
      //     重复跑全靠行动级查重兜底，需裁决项会重复建刷屏）
      const processed = db.prepare(
        `SELECT id FROM agent_log
          WHERE campaign_id = ? AND step = 'register' AND target = ? AND ok = 1
            AND detail LIKE ? LIMIT 1`
      ).get(campaignId, String(g.group_id), `%"hash":"${hash}"%`)
      if (processed) {
        row.hashSkipped = true
        logAgent(db, runId, campaignId, 'skip', g.group_id, true, { hash, reason: '同公告已登记过' })
        continue
      }

      // 3) 纯规则标准化：按 从者/御主 前缀分段，各自用对应单位键
      //    （没写前缀的公告整段算从者，与面板手选单位的习惯一致）
      const unitBase = g.class
      if (!unitBase) {
        row.error = '群映射未填职阶（class），无法推断单位键'
        logAgent(db, runId, campaignId, 'check', g.group_id, false, { error: row.error, hash })
        continue
      }
      const parts = splitByRole(text)
      const registeredKeys = []
      const rulingNotes = []

      for (const { role, part } of parts) {
        const unitKey = `${unitBase}${role === '御主' ? '御' : '从'}`
        const { standards, failures } = standardizeAnnouncement(db, part, { campaignId, round, phase, unitKey })

        // 3a) 纯规则成功的直接登记（带查重）
        for (const s of standards) {
          if (hasDuplicateAction(db, campaignId, round, phase, unitKey, s.actionKey, s.target, s.fragment)) {
            row.duplicates++
            continue
          }
          const id = insertAction(db, campaignId, round, phase, unitKey, s.actionKey, s.target, null, s.fragment)
          row.registered++
          registeredKeys.push({ id, unitKey, actionKey: s.actionKey, target: s.target, from: 'rule' })
        }

        // 3b) 失败片段：LLM 兜底（预算内 + 开关开），否则进需裁决
        for (const f of failures) {
          const canLlm = cfg.agentLlmEnabled === '1' && tokens < budget
          let llmOk = false
          if (canLlm) {
            const verbs = db.prepare(`SELECT action_key FROM action_rules ORDER BY action_key`).all().map(r => r.action_key)
            const leylines = db.prepare(`SELECT name FROM leyline WHERE campaign_id = ?`).all(campaignId).map(r => r.name)
            const llm = await parseWithLLM(f.fragment, { verbs, leylines, unitKey, round, phase })
            tokens += llm.tokens ?? 0
            if (llm.tokens) { row.llmUsed++; logAgent(db, runId, campaignId, 'llm_parse', g.group_id, llm.ok, { fragment: f.fragment, actions: llm.actions ?? [], error: llm.error ?? null }, llm.tokens) }
            for (const a of (llm.actions ?? [])) {
              // 白名单校验：动词必须在 action_rules 里才可信
              const rule = db.prepare(`SELECT action_key FROM action_rules WHERE action_key = ?`).get(String(a.verb ?? '').trim())
              if (!rule) continue
              if (hasDuplicateAction(db, campaignId, round, phase, unitKey, rule.action_key, a.target ?? null, f.fragment)) { row.duplicates++; continue }
              const id = insertAction(db, campaignId, round, phase, unitKey, rule.action_key, a.target ?? null, null, f.fragment)
              row.registered++
              llmOk = true
              registeredKeys.push({ id, unitKey, actionKey: rule.action_key, target: a.target ?? null, from: 'llm' })
            }
          }
          // LLM 也没救回来的 → 需裁决（带 LLM 备注/原文，GM 拍板）；同条 open 裁决已存在则不重建
          if (!llmOk) {
            const ctx = `${unitKey} 片段"${f.fragment}": ${f.message}`
            const dupeRuling = db.prepare(
              `SELECT id FROM engine_pending_ruling
                WHERE campaign_id = ? AND round = ? AND phase = ? AND status = 'open' AND context = ?`
            ).get(campaignId, round, phase, ctx)
            if (dupeRuling) continue
            const info = db.prepare(
              `INSERT INTO engine_pending_ruling (campaign_id, round, phase, kind, context, ai_guess)
               VALUES (?,?,?,?,?,?)`
            ).run(campaignId, round, phase, 'parse_fail', ctx, canLlm ? 'LLM 未能给出可信解析' : null)
            row.rulings++
            rulingNotes.push({ rulingId: info.lastInsertRowid, fragment: f.fragment })
          }
        }
      }

      // 公告级幂等标记：本次（round+phase+hash）处理过了，写一条 register 审计
      logAgent(db, runId, campaignId, 'register', g.group_id, true, {
        hash, round, phase, registered: row.registered, duplicates: row.duplicates, rulings: row.rulings, keys: registeredKeys,
      })

      // 4) 私组确认回执（过出口闸再发）
      if (row.registered > 0 || row.rulings > 0) {
        let msg = `【引擎】第${round ?? '?'}天${phase}行动已登记：成功 ${row.registered} 条`
        if (row.duplicates) msg += `（跳过重复 ${row.duplicates} 条）`
        if (row.rulings) msg += `，待 GM 裁决 ${row.rulings} 条`
        const gate = screenOutbound(db, campaignId, msg, 'private')
        row.gateHits += gate.hits.length
        if (gate.blocked) {
          logAgent(db, runId, campaignId, 'exit_gate', g.group_id, false, { reason: gate.reason })
        } else {
          await ports.sendMsg(napcatBase, g.group_id, gate.text)
          row.confirmed = true
          logMessage(db, { campaignId, channel: 'agent_out', groupId: g.group_id, groupName: g.group_name, userName: 'AI助手', content: gate.text })
          logAgent(db, runId, campaignId, 'confirm', g.group_id, true, { text: gate.text, hits: gate.hits })
        }
      }
    } catch (e) {
      row.error = e.message
      logAgent(db, runId, campaignId, 'check', g.group_id, false, { error: e.message })
    }
  }

  // 5) 催未交（过出口闸再发）
  for (const row of rows) {
    if (row.submitted || row.error) continue
    const round = opts.round ?? null
    const phase = opts.phase ?? cfg.agentPhase ?? '昼'
    const msg = `【行动提醒】第${round ?? '?'}天${phase}行动提交：请把本组行动写进本群公告。`
    const gate = screenOutbound(db, campaignId, msg, 'private')
    if (gate.blocked) { logAgent(db, runId, campaignId, 'exit_gate', row.groupId, false, { reason: gate.reason }); continue }
    try {
      await ports.sendMsg(napcatBase, row.groupId, gate.text)
      row.reminded = true
      logMessage(db, { campaignId, channel: 'agent_out', groupId: row.groupId, userName: 'AI助手', content: gate.text })
      logAgent(db, runId, campaignId, 'remind', row.groupId, true, { text: gate.text })
    } catch (e) {
      logAgent(db, runId, campaignId, 'remind', row.groupId, false, { error: e.message })
    }
  }

  const summary = {
    runId,
    campaignId,
    groups: rows,
    totals: {
      submitted: rows.filter(r => r.submitted).length,
      registered: rows.reduce((n, r) => n + r.registered, 0),
      duplicates: rows.reduce((n, r) => n + r.duplicates, 0),
      rulings: rows.reduce((n, r) => n + r.rulings, 0),
      llmCalls: rows.reduce((n, r) => n + r.llmUsed, 0),
      confirmed: rows.filter(r => r.confirmed).length,
      reminded: rows.filter(r => r.reminded).length,
      errors: rows.filter(r => r.error).length,
    },
    tokens,
    budget,
  }
  logAgent(db, runId, campaignId, 'run', null, true, summary.totals, tokens)
  return summary
}

// ---------- 定时器（后台自动收行动） ----------

const timerState = { timer: null, running: false, lastRunAt: null, lastError: null, note: '未启动' }

/** 按当前配置（重新）装订定时器；配置变化后调一次即可 */
export function startAgentTimer(db) {
  stopAgentTimer()
  const cfg = getAgentConfig(db)
  if (cfg.agentEnabled !== '1') {
    timerState.note = '定时收行动未启用'
    return { ...timerState }
  }
  const minutes = Math.max(5, Number(cfg.agentIntervalMinutes) || 30)
  timerState.timer = setInterval(async () => {
    if (timerState.running) return
    const c = getAgentConfig(db) // 每次读最新配置，面板改了立刻生效
    if (c.agentEnabled !== '1') return
    const campaignId = Number(c.agentCampaignId) || 0
    if (!campaignId) return
    timerState.running = true
    try {
      await collectActions(db, campaignId, { config: c, napcatBase: c.napcatHttpBase })
      timerState.lastRunAt = new Date().toISOString()
      timerState.lastError = null
    } catch (e) {
      timerState.lastError = e.message
      console.error('[agent] 定时收行动失败:', e.message)
    } finally {
      timerState.running = false
    }
  }, minutes * 60000)
  timerState.note = `每 ${minutes} 分钟自动收行动（战役 #${cfg.agentCampaignId || '未配置'}）`
  return { ...timerState }
}

/** 停掉定时器 */
export function stopAgentTimer() {
  if (timerState.timer) { clearInterval(timerState.timer); timerState.timer = null }
  timerState.running = false
  timerState.note = '定时收行动未启用'
}

/** 定时器运行状态（面板展示用） */
export function getTimerStatus() {
  return { running: timerState.running, lastRunAt: timerState.lastRunAt, lastError: timerState.lastError, note: timerState.note, active: !!timerState.timer }
}
