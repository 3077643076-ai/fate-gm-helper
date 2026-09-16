// 引擎 API 路由：/api/engine/*
// 消费方：fate-actions 插件（QQ 指令）/ 网页引擎面板（规划中）/ 离线回放
import { Router } from 'express'
import { openEngineDb } from './store.mjs'
import { parseAnnouncement, standardizeAnnouncement, normalizeLeyline } from './parser.mjs'
import { parseWithLLM } from './llm.mjs'
import { settleRound } from './settler.mjs'
import { callNapcat, fetchGroupNotices, pickActionNotice, pickStatusNotice, sendGroupMsg } from './qqport.mjs'
import { extractTimeHeader } from './agent.mjs'
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

// ---------- 登记行动：文本 → 多行动解析（切分器+别名归一） → 逐条入库（失败片段进需裁决） ----------
router.post('/actions', (req, res) => {
  const { campaignId, round, phase = '昼', unitKey, text } = req.body ?? {}
  if (!requireCampaignId(campaignId)) return res.status(400).json({ error: '需要 campaignId（战役 ID）' })
  if (!unitKey || !text) return res.status(400).json({ error: '需要 unitKey 和 text' })
  const rRound = round ?? currentRound(campaignId)

  const parsed = parseAnnouncement(db, text, { campaignId, round: rRound, phase, unitKey })
  const registered = []

  const nextSlot = () => {
    const row = db.prepare(
      `SELECT COALESCE(MAX(slot), 0) + 1 AS next FROM engine_actions
        WHERE campaign_id = ? AND round = ? AND phase = ? AND unit_key = ?`
    ).get(campaignId, rRound, phase, unitKey)
    return row.next
  }

  for (const a of parsed.actions) {
    const slot = nextSlot()
    const result = db.prepare(`
      INSERT INTO engine_actions (campaign_id, round, phase, unit_key, slot, action_key, target, variant, raw_text)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(campaignId, rRound, phase, unitKey, slot, a.actionKey, a.target, a.variant, a.rawText)
    registered.push({ id: result.lastInsertRowid, slot, actionKey: a.actionKey, target: a.target, fragment: a.fragment })
  }

  const rulingIds = []
  for (const f of parsed.failures) {
    // 防重：同一单位+同一片段已有 open 裁决就不重复插入
    const context = `${unitKey} 片段"${f.fragment}": ${f.message}`
    const dup = db.prepare(
      `SELECT id FROM engine_pending_ruling WHERE campaign_id = ? AND status = 'open' AND context = ? LIMIT 1`
    ).get(campaignId, context)
    if (dup) {
      rulingIds.push(dup.id)
      continue
    }
    const info = db.prepare(
      `INSERT INTO engine_pending_ruling (campaign_id, round, phase, kind, context) VALUES (?,?,?,?,?)`
    ).run(campaignId, rRound, phase, f.kind ?? 'parse_fail', context)
    rulingIds.push(info.lastInsertRowid)
  }

  if (parsed.noneOk && parsed.failures.length) {
    return res.status(422).json({ error: parsed.failures[0].message, failures: parsed.failures, pendingRulingIds: rulingIds })
  }
  res.json({
    ok: true,
    registered,
    failures: parsed.failures,
    pendingRulingIds: rulingIds,
    multiAction: registered.length > 1,
    note: registered.length > 1 ? `${unitKey} 本时段登记了 ${registered.length} 动——请核对其多动权来源（技能/宝具）` : undefined,
  })
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

// 批量忽略：把当前全部 open 的 parse_fail 标记为已忽略（解析噪音清理用）
router.post('/rulings/bulk-ignore', (req, res) => {
  const campaignId = requireCampaignId(req.query.campaignId ?? req.body?.campaignId)
  if (!campaignId) return res.status(400).json({ error: '需要 campaignId' })
  const r = db.prepare(`
    UPDATE engine_pending_ruling SET status='resolved',
      resolution=COALESCE(NULLIF(resolution, ''), '忽略（解析噪音）'),
      resolved_at=datetime('now','localtime')
    WHERE campaign_id = ? AND status = 'open' AND kind = 'parse_fail'
  `).run(campaignId)
  res.json({ ok: true, ignored: r.changes })
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

// ---------- 标准化转换：模糊公告 → 标准行动单（纯规则+别名表，实时零 token） ----------
// LLM 不在实时链路：看不懂的进需裁决；离线用 tools/llm-enrich.mjs 让 LLM 学新别名（人确认入库）
router.post('/standardize', async (req, res) => {
  const { campaignId, round, phase = '昼', unitKey, texts, useLlm = false } = req.body ?? {}
  if (!unitKey || !Array.isArray(texts)) return res.status(400).json({ error: '需要 unitKey 和 texts（公告文本数组）' })

  const verbs = db.prepare(`SELECT action_key FROM action_rules ORDER BY action_key`).all().map(r => r.action_key)
  const leylines = db.prepare(`SELECT name FROM leyline WHERE campaign_id = ?`).all(campaignId).map(r => r.name)

  const results = []
  for (const text of texts) {
    const { standards, failures, fragments } = standardizeAnnouncement(db, String(text), {
      campaignId, round: round ?? currentRound(campaignId), phase, unitKey,
    })
    const allFailures = [...failures]
    const llmNotes = []

    // LLM 兜底：规则解析失败的片段交给 LLM 语义解析，输出经白名单校验
    if (useLlm && failures.length) {
      for (const f of failures) {
        const llm = await parseWithLLM(f.fragment, { verbs, leylines, unitKey, round, phase })
        if (!llm.ok || !llm.actions?.length) {
          llmNotes.push(`片段"${f.fragment}"：${llm.error ?? (llm.unparsed ? 'LLM 判定无法解析' : 'LLM 无输出')}`)
          continue
        }
        for (const a of llm.actions) {
          const verb = String(a.verb ?? '').trim()
          if (!verbs.includes(verb)) {
            llmNotes.push(`LLM 输出动词"${verb}"不在白名单（片段"${f.fragment}"）→ 需裁决`)
            allFailures.push({ fragment: f.fragment, kind: 'llm_reject', message: `LLM 给出的动词"${verb}"不在白名单` })
            continue
          }
          let target = a.target ?? null
          if (target) {
            const ley = normalizeLeyline(db, target, campaignId)
            if (ley && typeof ley === 'string') target = ley
          }
          const rule = db.prepare(`SELECT * FROM action_rules WHERE action_key = ?`).get(verb)
          const fakeAction = { unitKey, actionKey: verb, target, variant: null }
          standards.push({
            standard: formatActionStandard(fakeAction, rule, { round, phase }) + (a.note ? `（LLM:${a.note}）` : ''),
            fragment: f.fragment,
            actionKey: verb,
            target,
            llm: true,
          })
        }
      }
    }

    results.push({ text, standards, failures: allFailures, llmNotes })
  }
  res.json({ results })
})

// ---------- 群映射（私组/灵脉群/公屏/GM 群的配置，分发版各团自己录） ----------
router.get('/groups', (req, res) => {
  const campaignId = requireCampaignId(req.query.campaignId)
  if (!campaignId) return res.status(400).json({ error: '需要 campaignId' })
  res.json(db.prepare(`SELECT id, group_id, group_name, kind, class, leyline FROM engine_group_binding WHERE campaign_id = ? ORDER BY kind, class`).all(campaignId))
})
router.post('/groups', (req, res) => {
  const { campaignId, group_id, group_name, kind, class: klass, leyline } = req.body ?? {}
  if (!requireCampaignId(campaignId)) return res.status(400).json({ error: '需要 campaignId' })
  if (!group_id || !kind) return res.status(400).json({ error: '需要 group_id 和 kind（private/leyline/public/gm）' })
  const r = db.prepare(
    `INSERT INTO engine_group_binding (campaign_id, group_id, group_name, kind, class, leyline) VALUES (?,?,?,?,?,?)`
  ).run(campaignId, String(group_id), group_name ?? '', kind, klass ?? null, leyline ?? null)
  res.json({ ok: true, id: r.lastInsertRowid })
})
router.delete('/groups/:id', (req, res) => {
  const r = db.prepare(`DELETE FROM engine_group_binding WHERE id = ?`).run(req.params.id)
  if (r.changes === 0) return res.status(404).json({ error: '群映射不存在' })
  res.json({ ok: true })
})

// ---------- 群映射自动识别（从机器人所在群 + 历史消息推断，用户确认后批量写入） ----------

// 从群名推断类型和职阶（规则来自 GM 实际用法）：
//   灵脉群：群名带"魔力量/人流量"（GM 改群名同步灵脉数值）→ leyline
//   公屏群：群名带"公屏/全体/公共" → public
//   GM 群：群名带"GM/管理/裁判" → gm
//   职阶群：群名带职阶字 → private + 职阶
function detectKindAndClass(groupName) {
  const text = String(groupName || '')
  if (/魔力量|人流量/.test(text)) return { kind: 'leyline', class: null }
  if (/公屏|全体|公共/.test(text)) return { kind: 'public', class: null }
  if (/GM|管理|裁判/.test(text)) return { kind: 'gm', class: null }
  const classTable = [
    { cls: '弓', re: /弓|archer/i },
    { cls: '枪', re: /枪|槍|lancer/i },
    { cls: '骑', re: /骑|騎|rider/i },
    { cls: '剑', re: /剑|劍|saber/i },
    { cls: '杀', re: /杀|殺|assassin/i },
    { cls: '术', re: /术|術|caster/i },
    { cls: '狂', re: /狂|berserker/i },
  ]
  for (const { cls, re } of classTable) {
    if (re.test(text)) return { kind: 'private', class: cls }
  }
  return { kind: 'private', class: null }
}

// 从灵脉群群名里推断关联的灵脉：拿本战役灵脉名逐个比对（群名一般以灵脉名开头）
function guessLeylineName(groupName, leylines) {
  const name = String(groupName || '')
  let best = null
  for (const l of leylines) {
    if (l.name && name.includes(l.name)) {
      // 取名字最长的一个（避免"灵脉-A"和"灵脉-AB"都命中时选错）
      if (!best || l.name.length > best.name.length) best = l
    }
  }
  return best?.name || null
}

// 圣杯战役相关判定（机器人常兼营私骰，所在群大部分与本战役无关）：
//   high    群名带战役状态格式（魔力/结界/战况/圣杯/令咒/灵脉）——职阶群改名特征，极强信号
//   medium  历史消息里有圣杯术语——弱信号
//   unrelated 群名像其他跑团/骰系（COC/SAN/克苏鲁/DND/TRPG/骰）且无强信号——疑似私骰群
//   low     其余（无任何信号）
const GROUP_NAME_HIGH = /魔力|结界|戰況|战况|圣杯|聖杯|令咒|靈脈|灵脉|魔力量|人流量/
const OTHER_TCG_NAME = /COC|SAN|克苏鲁|克蘇魯|DND|D&D|TRPG|跑团|跑團|骰|无限|無限/i
const HOLY_GRAIL_TERMS = /魔力|结界|灵脉|令咒|从者行动|御主行动|魂食|圣杯|人流量|回路|降临|战况/g

/** 按群名 + 历史消息内容算相关度：high/medium/low/unrelated + 人类可读理由
 *  kind/class：群名推断出的类型和职阶——职阶字是强信号（职阶群=私组，GM 口径） */
function detectRelevance(groupName, msgStat, kind, cls) {
  const name = String(groupName || '')
  if (GROUP_NAME_HIGH.test(name)) {
    return { relevance: 'high', reason: '群名带战役状态信息（魔力/结界/魔力量等），很可能是本战役群' }
  }
  if (cls) {
    return { relevance: 'high', reason: `群名带职阶字（${cls}），是本战役职阶群（私组）` }
  }
  if (OTHER_TCG_NAME.test(name)) {
    return { relevance: 'unrelated', reason: '群名像其他跑团/骰系群，疑似私骰用途' }
  }
  const hits = msgStat?.holy_hits || 0
  const total = msgStat?.message_count || 0
  if (hits >= 3) return { relevance: 'high', reason: `历史消息 ${total} 条中 ${hits} 条含圣杯术语` }
  if (hits >= 1) return { relevance: 'medium', reason: `历史消息 ${total} 条中 ${hits} 条含圣杯术语` }
  if (total > 0) return { relevance: 'low', reason: `历史消息 ${total} 条，但无圣杯相关内容` }
  return { relevance: 'low', reason: '没有历史消息记录' }
}

// 候选群列表：机器人所在群（get_group_list，含群名）+ 历史消息出现过的群，
// 排除已登记的；每条带相关度（high/medium/low/unrelated）和建议的 kind/class
router.get('/groups/auto-detect', async (req, res) => {
  const campaignId = requireCampaignId(req.query.campaignId)
  if (!campaignId) return res.status(400).json({ error: '需要 campaignId' })

  // 来源 1：机器人所在的所有群（NapCat get_group_list，带群名）
  const fromNapcat = []
  try {
    const list = await callNapcat(null, 'get_group_list', {})
    if (Array.isArray(list)) {
      for (const g of list) {
        fromNapcat.push({ groupId: String(g.group_id), groupName: g.group_name || '' })
      }
    }
  } catch (e) {
    return res.status(502).json({ error: `NapCat 未连接（${e.message}）——先在机器人连接页登录` })
  }

  // 来源 2：历史消息（按群聚合计数 + 统计圣杯术语命中数）
  const msgRows = db.prepare(`
    SELECT group_id, content FROM message_log
    WHERE group_id IS NOT NULL AND group_id != ''
  `).all()
  const statMap = new Map()
  for (const r of msgRows) {
    const key = String(r.group_id)
    const stat = statMap.get(key) || { message_count: 0, holy_hits: 0, last_at: null }
    stat.message_count++
    HOLY_GRAIL_TERMS.lastIndex = 0
    if (HOLY_GRAIL_TERMS.test(String(r.content || ''))) stat.holy_hits++
    statMap.set(key, stat)
  }

  // 已登记的群排除
  const existing = new Set(
    db.prepare(`SELECT group_id FROM engine_group_binding WHERE campaign_id = ?`).all(campaignId).map(r => String(r.group_id))
  )

  // 本战役灵脉表：给灵脉群推断"关联灵脉"用
  const leylines = db.prepare(`SELECT id, name FROM leyline WHERE campaign_id = ?`).all(campaignId)

  const rankMap = { high: 0, medium: 1, low: 2, unrelated: 3 }
  const candidates = fromNapcat
    .filter(g => !existing.has(g.groupId))
    .map(g => {
      const { kind, class: klass } = detectKindAndClass(g.groupName)
      const stat = statMap.get(g.groupId)
      const { relevance, reason } = detectRelevance(g.groupName, stat, kind, klass)
      // 灵脉群：按群名猜关联的灵脉
      const suggestedLeyline = kind === 'leyline' ? guessLeylineName(g.groupName, leylines) : null
      return {
        groupId: g.groupId,
        groupName: g.groupName,
        suggestedKind: kind,
        suggestedClass: klass,
        suggestedLeyline,
        messageCount: stat?.message_count || 0,
        lastAt: stat?.last_at || null,
        relevance,
        reason,
      }
    })
    .sort((a, b) => rankMap[a.relevance] - rankMap[b.relevance] || b.messageCount - a.messageCount)

  res.json({ candidates, leylines, note: '相关度是按群名和历史消息猜的，保存前请确认' })
})

// 批量写入群映射
router.post('/groups/bulk', (req, res) => {
  const { campaignId, items } = req.body ?? {}
  if (!requireCampaignId(campaignId)) return res.status(400).json({ error: '需要 campaignId' })
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: '需要 items（群映射数组）' })
  const insert = db.prepare(
    `INSERT INTO engine_group_binding (campaign_id, group_id, group_name, kind, class, leyline) VALUES (?,?,?,?,?,?)`
  )
  let saved = 0
  for (const it of items) {
    if (!it?.group_id || !it?.kind) continue
    insert.run(campaignId, String(it.group_id), it.group_name ?? '', it.kind, it.class ?? null, it.leyline ?? null)
    saved++
  }
  res.json({ ok: true, saved })
})

// ---------- 公告检查：一键读取各私组公告，区分行动公告和状态记录 ----------
// 交了=群里有行动类公告且时段对齐正在收的回合（GM 传 expectedTurn）；
// 行动公告的时段从文本头识别（"day2夜"→第2天夜=turn5），还是昼的旧公告会标"未更新"
router.post('/notices/check', async (req, res) => {
  const { campaignId } = req.body ?? {}
  // napcatBase 可空：qqport 优先走 WS 通道，HTTP 只是回落
  const napcatBase = req.body?.napcatBase || 'http://127.0.0.1:3000'
  // expectedTurn：GM 正在收的回合（turn_number）——用来对齐各组行动公告的时段
  const expectedTurn = req.body?.expectedTurn ? Number(req.body.expectedTurn) : null
  if (!requireCampaignId(campaignId)) return res.status(400).json({ error: '需要 campaignId' })
  const groups = db.prepare(`SELECT group_id, group_name, class FROM engine_group_binding WHERE campaign_id = ? AND kind = 'private' ORDER BY class`).all(campaignId)
  if (!groups.length) return res.status(400).json({ error: '本战役还没有私组群映射：请到「设置 → 群绑定」，点"从机器人所在群自动识别"，勾选职阶群后保存' })

  const checked = []
  const failed = []
  for (const g of groups) {
    try {
      // 拉全部公告（最新在前），分拣出行动公告和状态记录
      const notices = await fetchGroupNotices(napcatBase, g.group_id)
      const actionNotice = pickActionNotice(notices)
      const statusNotice = pickStatusNotice(notices)
      const hasAny = notices.length > 0
      // 行动公告的时段：从文本时段头解析出属于哪个回合
      // turn 换算：第N天昼=2N，第N天夜=2N+1（第1天昼=turn2，第2天夜=turn5）
      let noticeTurn = null
      let noticePhase = null
      if (actionNotice) {
        const header = extractTimeHeader(actionNotice.text)
        if (header?.round && header?.phase) {
          noticeTurn = header.round * 2 + (header.phase === '夜' ? 1 : 0)
          noticePhase = header.phase
        }
      }
      // 时段对齐：公告写的回合 vs GM 正在收的回合
      const aligned = expectedTurn && noticeTurn ? noticeTurn === expectedTurn : null
      checked.push({
        class: g.class ?? g.group_name ?? g.group_id,
        groupId: g.group_id,
        // 兼容旧字段：hasNotice = 有任何公告
        hasNotice: hasAny,
        // 行动公告：有没有交行动看它
        hasAction: !!actionNotice,
        confirmed: !!actionNotice && actionNotice.text.includes('机器人已确认'),
        actionText: actionNotice?.text.slice(0, 160) || '',
        actionTime: actionNotice?.pubTime || '',
        noticeTurn,
        noticePhase,
        aligned,
        // 状态记录公告：单独一栏展示，不参与交行动判定
        hasStatus: !!statusNotice,
        statusText: statusNotice?.text.slice(0, 160) || '',
        statusTime: statusNotice?.pubTime || '',
      })
    } catch (e) {
      failed.push({ class: g.class ?? g.group_id, groupId: g.group_id, error: e.message })
    }
  }

  // 未交行动 = 没有行动公告，或行动公告的时段和正在收的回合不一致（还是昼的旧公告）
  const missing = checked.filter(c => !c.hasAction || (expectedTurn && c.aligned === false)).map(c => c.class)
  res.json({
    checked,
    missing,
    failed,
    expectedTurn,
    summary: {
      total: groups.length,
      submitted: checked.filter(c => c.hasAction && c.aligned !== false).length,
      missing: missing.length,
      failed: failed.length,
      statusOnly: checked.filter(c => c.hasStatus && !c.hasAction).length,
    },
  })
})

// ---------- 一键提醒：向未交行动的私组发提醒消息 ----------
router.post('/notices/remind', async (req, res) => {
  // napcatBase 可空：qqport 优先走 WS 通道
  const { campaignId, groups, round, phase, customText } = req.body ?? {}
  const napcatBase = req.body?.napcatBase || 'http://127.0.0.1:3000'
  if (!requireCampaignId(campaignId)) return res.status(400).json({ error: '需要 campaignId' })
  if (!Array.isArray(groups) || !groups.length) return res.status(400).json({ error: '需要 groups（要提醒的群映射列表）' })

  const defaultText = `【行动提醒】第${round ?? '?'}天 ${phase ?? ''}行动提交：请把本组行动写进本群公告，并发 .确认行动 确认。`
  const sent = []
  const failed = []
  for (const g of groups) {
    try {
      await sendGroupMsg(napcatBase, g.groupId, customText ?? defaultText)
      sent.push(g.class ?? g.groupId)
    } catch (e) {
      failed.push({ class: g.class ?? g.groupId, error: e.message })
    }
  }
  res.json({ ok: failed.length === 0, sent, failed })
})

export default router
