// 引擎指令解析器：玩家文本 → 结构化行动
// 解析链（SOP 3.2 / 引擎规格第三节）：
//   文本清洗 → 别名归一（alias_registry）→ 动词白名单校验（action_rules）
//   → 目标归一（leyline）→ 成功结构化 / 失败进需裁决
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 归一候选：在别名表里查标准名（精确匹配；kind=action 优先于旧建模行，M1 版拼音/编辑距离 M2 接入） */
function normalizeByAlias(db, text) {
  const row = db.prepare(
    `SELECT canonical, kind FROM alias_registry WHERE alias = ?
      ORDER BY CASE kind WHEN 'action' THEN 0 ELSE 1 END, id LIMIT 1`
  ).get(text)
  return row ?? null
}

/** 目标灵脉归一：支持"灵脉-B"/"B脉"/直接灵脉名（战役无关，campaignId 由调用方传入） */
export function normalizeLeyline(db, text, campaignId) {
  if (!text) return null
  const t = String(text).trim()
  if (!campaignId) throw new Error('normalizeLeyline 需要 campaignId')
  // 直接命中灵脉名（或去掉"灵脉-"前缀后命中）
  const bare = t.replace(/^灵脉[-—]?/, '')
  const row = db.prepare(`SELECT name FROM leyline WHERE campaign_id = ? AND (name = ? OR name = ?)`).get(campaignId, t, bare)
  if (row) return row.name
  // 简称：单字/短词 LIKE（如 "B" → 灵脉-B 类命名；三国杯灵脉是中文名，此规则兜底）
  const like = db.prepare(`SELECT name FROM leyline WHERE campaign_id = ? AND name LIKE ? LIMIT 2`).all(campaignId, `%${bare}%`)
  if (like.length === 1) return like[0].name
  if (like.length > 1) return { ambiguous: like.map(l => l.name) }
  return null
}

/** 片段清理：去掉切分残留的连接词开头（先/首先/然后/接着/之后） */
function cleanFragment(frag) {
  return frag.replace(/^(?:首先|然后|接着|之后|先)\s*/, '').trim()
}

/**
 * 公告预处理：剥离"从者：/御主："角色前缀与时段头（"第N天昼"/"day1昼"），
 * 按 | 分段（真实公告的常见结构），输出干净的候选片段
 */
export function preprocessAnnouncement(text) {
  let t = String(text ?? '').trim()
  // 去时段头（开头或竖线段首："第1天昼"、"day1夜"、"第一日昼"）
  t = t.replace(/(?:^|\|)\s*(?:第\s*[0-9一二三四五六七八九]+\s*[天日]|day\s*\d+)\s*(?:昼|夜)?\s*/gi, '|')
  // 角色前缀 → 换成分段标记（从者：X 御主：Y = 两条行动；空格分隔同样识别）
  t = t.replace(/(从者|御主)\s*[:：]?\s*/g, '|')
  // 竖线分段
  const segs = t.split(/\|/).map(s => s.trim()).filter(Boolean)
  // 每段内部再按顿号/逗号细切（如 "阵地制作，同时额外宣言俩次"）
  const out = []
  for (const seg of segs) {
    for (const piece of seg.split(/\s*[，,]\s*/)) {
      const p = piece.trim()
      if (p) out.push(p)
    }
  }
  return out
}

/**
 * 公告切分总入口：结构化预处理（角色前缀/竖线/时段头）+ 递归细分 + 五级切分
 */
export function splitAnnouncement(text) {
  const t = String(text ?? '').trim()
  if (!t) return []

  // 0) 结构化预处理：剥时段头、"从者：/御主："前缀转竖线、竖线与逗号分段
  const pre = preprocessAnnouncement(t)
  if (pre.length > 1) {
    const out = []
    for (const seg of pre) out.push(...splitAnnouncement(seg))
    return out
  }
  if (pre.length === 1 && pre[0] !== t) return splitAnnouncement(pre[0])

  // 1) 显式动次标记（一动：xxx 二动：yyy）
  const markRe = /(?:第?[一二三四五1-5]动|行动[一二三四五1-5]?|[①②③④⑤])\s*[:：、，,.]?\s*/g
  if (markRe.test(t)) {
    markRe.lastIndex = 0
    const marks = []
    let m
    while ((m = markRe.exec(t)) !== null) marks.push({ start: m.index, end: m.index + m[0].length })
    const fragments = []
    for (let i = 0; i < marks.length; i++) {
      const seg = cleanFragment(t.slice(marks[i].end, i + 1 < marks.length ? marks[i + 1].start : undefined).trim())
      if (seg) fragments.push(seg)
    }
    if (fragments.length > 1) return fragments
  }

  // 2) 换行
  const lines = t.split(/\r?\n/).map(s => cleanFragment(s.trim())).filter(Boolean)
  if (lines.length > 1) return lines

  // 3) 序号列表（1. 2. / 1、2、）
  const numRe = /(?:^|\s)\d[.、)]\s*/g
  if (numRe.test(t)) {
    numRe.lastIndex = 0
    const marks = []
    let m
    while ((m = numRe.exec(t)) !== null) marks.push({ start: m.index, end: m.index + m[0].length })
    const fragments = []
    for (let i = 0; i < marks.length; i++) {
      const seg = cleanFragment(t.slice(marks[i].end, i + 1 < marks.length ? marks[i + 1].start : undefined).trim())
      if (seg) fragments.push(seg)
    }
    if (fragments.length > 1) return fragments
  }

  // 4) 时段词（白天X晚上Y = 跨时段意向，切成两条登记并备注）
  const dayNightRe = /\s*(?:白天|日间|晚上|夜里|夜间)\s*/g
  if (dayNightRe.test(t)) {
    dayNightRe.lastIndex = 0
    const segs = t.split(dayNightRe).map(s => cleanFragment(s)).filter(Boolean)
    if (segs.length > 1) return segs
  }

  // 5) 连接词与标点
  const segs = t.split(/\s*(?:然后|再|接着|之后|，|。|；|;)\s*/).map(s => cleanFragment(s)).filter(Boolean)
  if (segs.length > 1) return segs

  return [cleanFragment(t)]
}

/**
 * 解析一整条公告（可能是多个行动）：逐片段解析并汇总
 * 返回 { actions: [结构化行动]（全部成功的）, failures: [{fragment, message}]（进需裁决）, needRuling }
 */
export function parseAnnouncement(db, text, opts = {}) {
  const fragments = splitAnnouncement(text)
  const actions = []
  const failures = []
  for (const frag of fragments) {
    const r = parseAction(db, frag, opts)
    if (r.ok) actions.push({ ...r.action, fragment: frag })
    else failures.push({ fragment: frag, kind: r.kind ?? 'parse_fail', message: r.message })
  }
  return { fragments, actions, failures, allOk: failures.length === 0, noneOk: actions.length === 0 }
}

/**
 * 标准化单条行动的表示（模糊公告的"标准行动单"输出格式）
 * 格式：第N天{phase} {单位} {动词} [→ 目标]（{变体}｜链:位置｜判定x%｜魔力±n｜限制）
 */
export function formatActionStandard(a, rule, opts = {}) {
  const timepoint = `第${opts.round ?? '?'}天${opts.phase ?? ''}`
  let line = `${timepoint} ${a.unitKey} ${a.actionKey}`
  if (a.target) line += ` → ${a.target}`
  if (a.variant) line += `（${a.variant}）`
  const notes = []
  if (rule) {
    if (rule.phase) notes.push(`链:${rule.phase}`)
    if (rule.base_rate != null) {
      let rate = `判定${rule.base_rate}%`
      if (Number(rule.day_bonus)) rate += `（昼+${rule.day_bonus}）`
      if (Number(rule.night_bonus)) rate += `（夜+${rule.night_bonus}）`
      notes.push(rate)
    }
    if (rule.rate_formula) notes.push(`判定:${rule.rate_formula}`)
    if (Number(rule.mana_cost)) notes.push(`魔力-${rule.mana_cost}`)
    if (Number(rule.mana_gain)) notes.push(`魔力+${rule.mana_gain}`)
    if (rule.limit_per) notes.push(rule.limit_per)
  }
  line += notes.length ? `（${notes.join('｜')}）` : ''
  return line
}

/**
 * 模糊公告 → 标准行动单（纯转换，不落库——预览/批量转换用）
 * 返回 { standards: [{standard, fragment, actionKey}], failures: [{fragment, message}] }
 */
export function standardizeAnnouncement(db, text, opts = {}) {
  const parsed = parseAnnouncement(db, text, opts)
  const standards = []
  for (const a of parsed.actions) {
    const rule = db.prepare(`SELECT * FROM action_rules WHERE action_key = ?`).get(a.actionKey)
    standards.push({
      standard: formatActionStandard(a, rule, opts),
      fragment: a.fragment,
      actionKey: a.actionKey,
      target: a.target,
    })
  }
  return { standards, failures: parsed.failures }
}

/**
 * 解析单条行动文本（"动词 目标"格式；多行动公告请用 parseAnnouncement）
 */
export function parseAction(db, rawText, opts = {}) {
  let text = String(rawText ?? '').trim()
  // 去掉指令前缀
  text = text.replace(/^([.。]?\s*(?:行动|从者行动|御主行动)\s*)/, '').trim()
  if (!text) return { ok: false, needRuling: true, kind: 'parse_fail', message: '行动内容为空' }

  // 切分：第一个空格前=动词候选，其余=目标
  const parts = text.split(/\s+/)
  let verbToken = parts[0]
  let targetToken = parts.slice(1).join(' ') || null

  // 动词归一：先查别名（可能命中"动词 目标"复合格式，如 "搓空花"→"解放 虚荣的空中庭院"）
  let actionKey = null
  let variant = null
  const aliasHit = normalizeByAlias(db, verbToken)
  if (aliasHit && aliasHit.kind === 'action') {
    const canonParts = aliasHit.canonical.split(/\s+/)
    const verbCandidate = canonParts[0]
    const verbRule = db.prepare(`SELECT action_key FROM action_rules WHERE action_key = ?`).get(verbCandidate)
    if (verbRule) {
      // 复合格式：第一词=动词（白名单内），其余=默认目标
      actionKey = verbCandidate
      if (canonParts.length > 1 && !targetToken) targetToken = canonParts.slice(1).join(' ')
    } else {
      actionKey = aliasHit.canonical
    }
  } else {
    // 直接命中 action_rules
    const direct = db.prepare(`SELECT action_key FROM action_rules WHERE action_key = ?`).get(verbToken)
    if (direct) actionKey = direct.action_key
  }
  // 魂食变体：恶性魂食/无限制魂食是独立 key；"魂食 遮断"目标位变体
  if (!actionKey && /^魂食/.test(verbToken)) {
    actionKey = '魂食'
    const v = verbToken.replace(/^魂食/, '')
    if (v) variant = v
  }
  if (!actionKey) {
    return {
      ok: false, needRuling: true, kind: 'parse_fail',
      message: `动词"${verbToken}"不在行动白名单（已尝试别名归一）`,
    }
  }

  // 动词可能整体是别名指向带括号的规范名（如 "开殿"→"他者封印·鲜血神殿(解放)"）
  actionKey = actionKey.replace(/\(.*\)$/, '')

  // 白名单校验
  const rule = db.prepare(`SELECT action_key, who, base_rate, rate_formula, day_bonus, night_bonus, costs_action, mana_cost, mana_gain, phase, limit_per, effect_text FROM action_rules WHERE action_key = ?`).get(actionKey)
  if (!rule) {
    return {
      ok: false, needRuling: true, kind: 'parse_fail',
      message: `动词"${verbToken}"归一为"${actionKey}"但不在 action_rules（未录入口径）`,
    }
  }

  // 目标归一（灵脉类目标）
  let target = targetToken
  let targetNote = null
  if (targetToken) {
    const aliasTarget = normalizeByAlias(db, targetToken)
    if (aliasTarget) target = aliasTarget.canonical
    const ley = normalizeLeyline(db, target, opts.campaignId)
    if (ley) target = typeof ley === 'string' ? ley : null
    if (ley && typeof ley !== 'string') targetNote = `目标歧义：${ley.ambiguous.join('/')}`
  }

  return {
    ok: true,
    action: {
      campaignId: opts.campaignId ?? 999002,
      round: opts.round,
      phase: opts.phase,
      unitKey: opts.unitKey,
      actionKey,
      target,
      variant,
      rawText: text,
      targetNote,
      rule,
    },
  }
}
