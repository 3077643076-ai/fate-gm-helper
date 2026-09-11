// 引擎 API 路由：/api/engine/*
// 消费方：fate-actions 插件（QQ 指令）/ 网页引擎面板（规划中）/ 离线回放
import { Router } from 'express'
import { openEngineDb } from './store.mjs'
import { parseAnnouncement, standardizeAnnouncement, normalizeLeyline, formatActionStandard } from './parser.mjs'
import { parseWithLLM } from './llm.mjs'
import { settleRound, chainRank } from './settler.mjs'
import { fetchGroupNotices, sendGroupMsg } from './qqport.mjs'
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

// ---------- 口径表（只读，设置页展示） ----------
router.get('/rules', (_req, res) => {
  const rules = db.prepare(`
    SELECT action_key, who, phase, base_rate, rate_formula, day_bonus, night_bonus,
           costs_action, mana_cost, mana_gain, limit_per, effect_text
      FROM action_rules ORDER BY phase, action_key`).all()
  res.json({ rules })
})

// ---------- 单位注册表（只读，设置页展示 + 战斗页选人） ----------
router.get('/units', (_req, res) => {
  const units = db.prepare(`
    SELECT u.unit_key, u.class, u.side, u.code, u.missing,
           c.code AS card_code, c.id AS card_id
      FROM unit_registry u
      LEFT JOIN character_card c ON c.id = u.card_id
     ORDER BY u.class, u.side, u.unit_key`).all()
  res.json({ units })
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
    const info = db.prepare(
      `INSERT INTO engine_pending_ruling (campaign_id, round, phase, kind, context) VALUES (?,?,?,?,?)`
    ).run(campaignId, rRound, phase, f.kind ?? 'parse_fail', `${unitKey} 片段"${f.fragment}": ${f.message}`)
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

// ---------- 公告检查：一键读取各私组公告，标出未交行动的组 ----------
// 交了=群里有非空公告（最新一条含"机器人已确认"记为已确认）；没交=无公告或正文为空
/** 读各私组群公告状态（公告检查 / 行动统计 / 催未交 三处共用） */
async function checkPrivateNotices(campaignId, napcatBase) {
  const groups = db.prepare(`SELECT group_id, group_name, class FROM engine_group_binding WHERE campaign_id = ? AND kind = 'private' ORDER BY class`).all(campaignId)
  if (!groups.length) return { error: '本战役没有登记私组群映射（先在面板配置群映射）' }

  const checked = []
  const failed = []
  for (const g of groups) {
    try {
      const notices = await fetchGroupNotices(napcatBase, g.group_id)
      const latest = notices[0] ?? null
      const text = latest?.text ?? ''
      checked.push({
        class: g.class ?? g.group_name ?? g.group_id,
        groupId: g.group_id,
        hasNotice: text.length > 0,
        confirmed: text.includes('机器人已确认'),
        latestText: text.slice(0, 160),
        pubTime: latest?.pubTime ?? '',
      })
    } catch (e) {
      failed.push({ class: g.class ?? g.group_id, groupId: g.group_id, error: e.message })
    }
  }

  const missing = checked.filter(c => !c.hasNotice).map(c => c.class)
  return { checked, failed, missing, summary: { total: groups.length, submitted: checked.filter(c => c.hasNotice).length, missing: missing.length, failed: failed.length } }
}

router.post('/notices/check', async (req, res) => {
  const { campaignId, napcatBase } = req.body ?? {}
  if (!requireCampaignId(campaignId)) return res.status(400).json({ error: '需要 campaignId' })
  if (!napcatBase) return res.status(400).json({ error: '需要 napcatBase（NapCat HTTP 地址，如 http://127.0.0.1:3000）' })

  const result = await checkPrivateNotices(campaignId, napcatBase)
  if (result.error) return res.status(400).json({ error: result.error })
  res.json(result)
})

// ---------- 一键提醒：向未交行动的私组发提醒消息 ----------
router.post('/notices/remind', async (req, res) => {
  const { campaignId, napcatBase, groups, round, phase, customText } = req.body ?? {}
  if (!requireCampaignId(campaignId)) return res.status(400).json({ error: '需要 campaignId' })
  if (!napcatBase) return res.status(400).json({ error: '需要 napcatBase' })
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

// ---------- 一键催未交：自动检查各私组公告，向未交的组发提醒（检查+催办一步完成） ----------
router.post('/notices/remind-missing', async (req, res) => {
  const { campaignId, napcatBase, round, phase, customText } = req.body ?? {}
  if (!requireCampaignId(campaignId)) return res.status(400).json({ error: '需要 campaignId' })
  if (!napcatBase) return res.status(400).json({ error: '需要 napcatBase' })

  const check = await checkPrivateNotices(campaignId, napcatBase)
  if (check.error) return res.status(400).json({ error: check.error })

  const missing = check.checked.filter(c => !c.hasNotice).map(c => ({ groupId: c.groupId, class: c.class }))
  const defaultText = `【行动提醒】第${round ?? '?'}天 ${phase ?? ''}行动提交：请把本组行动写进本群公告，并发 .确认行动 确认。`
  const sent = []
  const failed = []
  for (const g of missing) {
    try {
      await sendGroupMsg(napcatBase, g.groupId, customText ?? defaultText)
      sent.push(g.class ?? g.groupId)
    } catch (e) {
      failed.push({ class: g.class ?? g.groupId, error: e.message })
    }
  }
  res.json({ ok: failed.length === 0, checkedTotal: check.checked.length, missingCount: missing.length, missingClasses: missing.map(g => g.class), sent, failed })
})

// ---------- 行动统计：现有提交汇总 + 规范文本按结算链排序（GM 结算前总览） ----------
// GET /actions/summary?campaignId&round&phase[&napcatBase]
// - 本地库视角：已登记行动（任意来源：面板/QQ 插件/AI 收行动）按结算链排序 + 单位/职阶汇总
// - napcatBase 可选：附带各私组公告状态（已交/已确认/未交/读取失败），统计+催办判定一次完成
// 排序口径与 settler 结算完全一致（chainRank 单一来源），GM 看到的顺序=引擎将结算的顺序
router.get('/actions/summary', async (req, res) => {
  const campaignId = requireCampaignId(req.query.campaignId)
  if (!campaignId) return res.status(400).json({ error: '需要 campaignId' })
  const round = Number(req.query.round) || currentRound(campaignId)
  const phase = req.query.phase || '昼'
  const napcatBase = req.query.napcatBase || null

  const ruleRows = db.prepare(`SELECT * FROM action_rules`).all()
  const rules = Object.fromEntries(ruleRows.map(r => [r.action_key, r]))
  const unitRows = db.prepare(`SELECT unit_key, class, side, code, missing FROM unit_registry`).all()
  const unitMap = Object.fromEntries(unitRows.map(u => [u.unit_key, u]))

  const rows = db.prepare(
    `SELECT id, unit_key, slot, action_key, target, variant, raw_text, status, settle_note, created_at
       FROM engine_actions
      WHERE campaign_id = ? AND round = ? AND phase = ?
      ORDER BY id`
  ).all(campaignId, round, phase)

  const actions = rows.map(row => {
    const rule = rules[row.action_key] ?? null
    const unit = unitMap[row.unit_key] ?? null
    return {
      id: row.id,
      unitKey: row.unit_key,
      unitCode: unit?.code ?? null,
      class: unit?.class ?? null,
      slot: row.slot,
      actionKey: row.action_key,
      target: row.target,
      variant: row.variant,
      status: row.status,
      settleNote: row.settle_note,
      createdAt: row.created_at,
      chain: rule?.phase ?? null,
      rank: chainRank(row.action_key, rule?.phase),
      standard: formatActionStandard({ unitKey: row.unit_key, actionKey: row.action_key, target: row.target, variant: row.variant }, rule, { round, phase }),
      rawText: row.raw_text,
      rate: rule?.base_rate ?? null,
      dayBonus: rule?.day_bonus ?? 0,
      nightBonus: rule?.night_bonus ?? 0,
      manaCost: rule?.mana_cost ?? 0,
      manaGain: rule?.mana_gain ?? 0,
      costsAction: rule?.costs_action ?? null,
    }
  }).sort((a, b) => a.rank - b.rank || a.slot - b.slot || a.unitKey.localeCompare(b.unitKey, 'zh') || a.id - b.id)

  // 结算链分段（同 rank 归一段；段内保持排序）
  const chainSections = []
  for (const a of actions) {
    let sec = chainSections.find(s => s.rank === a.rank)
    if (!sec) {
      sec = { rank: a.rank, chain: a.chain ?? (a.rank === 90 ? '灵脉行动' : '未归类'), actions: [] }
      chainSections.push(sec)
    }
    sec.actions.push(a)
  }
  chainSections.sort((x, y) => x.rank - y.rank)

  // 单位汇总 + 应交单位（私组职阶 × 从/御 且在单位注册表中的键）
  const byUnit = {}
  for (const a of actions) {
    const u = byUnit[a.unitKey] ??= { unitKey: a.unitKey, class: a.class, code: a.unitCode, total: 0, active: 0, void: 0 }
    u.total++
    if (a.status === 'void') u.void++
    else u.active++
  }
  const groupRows = db.prepare(`SELECT group_id, group_name, class FROM engine_group_binding WHERE campaign_id = ? AND kind = 'private' ORDER BY class`).all(campaignId)
  const expectedUnits = []
  for (const g of groupRows) {
    if (!g.class) continue
    for (const suffix of ['从', '御']) {
      const key = `${g.class}${suffix}`
      if (unitMap[key] && !expectedUnits.includes(key)) expectedUnits.push(key)
    }
  }

  // 职阶聚合（行动数落职阶，和私组公告状态对齐展示）
  const byClass = {}
  for (const a of actions) {
    if (a.status === 'void') continue
    const cls = a.class ?? a.unitKey.replace(/(从|御)$/, '')
    const stat = byClass[cls] ??= { actionCount: 0, units: [] }
    stat.actionCount++
    if (!stat.units.includes(a.unitKey)) stat.units.push(a.unitKey)
  }

  // 附带各私组公告状态（可选）
  let notices = null
  let noticesError = null
  if (napcatBase) {
    const check = await checkPrivateNotices(campaignId, napcatBase)
    if (check.error) noticesError = check.error
    else notices = check
  }

  const groups = groupRows.map(g => {
    const stat = byClass[g.class] ?? { actionCount: 0, units: [] }
    const notice = notices?.checked.find(c => c.class === g.class) ?? null
    return {
      class: g.class,
      groupId: g.group_id,
      groupName: g.group_name,
      actionCount: stat.actionCount,
      units: stat.units,
      hasNotice: notice?.hasNotice ?? null,
      confirmed: notice?.confirmed ?? null,
      latestText: notice?.latestText ?? '',
      pubTime: notice?.pubTime ?? '',
      noticeError: notices?.failed.find(f => f.class === g.class)?.error ?? null,
    }
  })

  const activeActions = actions.filter(a => a.status !== 'void')
  res.json({
    round,
    phase,
    summary: {
      groupsTotal: groupRows.length,
      groupsSubmitted: notices ? notices.summary.submitted : null,
      groupsMissing: notices ? notices.summary.missing : null,
      groupsFailed: notices?.summary.failed ?? 0,
      unitsExpected: expectedUnits.length,
      unitsRegistered: expectedUnits.filter(k => (byUnit[k]?.active ?? 0) > 0).length,
      extraUnits: Object.keys(byUnit).filter(k => !expectedUnits.includes(k)),
      actionsTotal: actions.length,
      actionsActive: activeActions.length,
      actionsVoid: actions.length - activeActions.length,
      pendingRulings: db.prepare(
        `SELECT COUNT(*) AS n FROM engine_pending_ruling WHERE campaign_id = ? AND status = 'open' AND round = ? AND phase = ?`
      ).get(campaignId, round, phase).n,
    },
    expectedUnits,
    units: Object.values(byUnit).sort((a, b) => a.unitKey.localeCompare(b.unitKey, 'zh')),
    groups,
    chainSections,
    actions,
    notices,
    noticesError,
  })
})

export default router
