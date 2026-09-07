// 引擎指令解析器：玩家文本 → 结构化行动
// 解析链（SOP 3.2 / 引擎规格第三节）：
//   文本清洗 → 别名归一（alias_registry）→ 动词白名单校验（action_rules）
//   → 目标归一（leyline）→ 成功结构化 / 失败进需裁决
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 归一候选：在别名表里查标准名（精确匹配，M1 版；拼音/编辑距离 M2 接入） */
function normalizeByAlias(db, text) {
  const row = db.prepare(`SELECT canonical, kind FROM alias_registry WHERE alias = ?`).get(text)
  return row ?? null
}

/** 目标灵脉归一：支持"灵脉-B"/"B脉"/直接灵脉名（战役无关，campaignId 由调用方传入） */
function normalizeLeyline(db, text, campaignId) {
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

/**
 * 解析一条行动文本
 * @param {DatabaseSync} db
 * @param {string} rawText     玩家原文（如 ".行动 机动 灵脉-B" / "魂食遮断"）
 * @param {object} opts        { campaignId, round, phase, unitKey }
 * @returns {object} { ok, action?, needRuling?, message? }
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

  // 动词归一：先查别名（"广侦"→广泛侦查 / "吃人"→魂食），再直接作为动词
  let actionKey = null
  let variant = null
  const aliasHit = normalizeByAlias(db, verbToken)
  if (aliasHit && aliasHit.kind === 'action') {
    actionKey = aliasHit.canonical
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
