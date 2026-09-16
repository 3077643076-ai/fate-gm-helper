function cleanText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function cleanJsonText(value, fallback = {}) {
  if (value === undefined || value === null || value === '') return JSON.stringify(fallback);
  if (typeof value === 'object') return JSON.stringify(value);
  try {
    JSON.parse(String(value));
    return String(value);
  } catch {
    return JSON.stringify(fallback);
  }
}

function parseJsonText(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

// 每回合最大发动次数：0=不限次数，正整数=次数上限，其他一律回落到默认 1 次
function resolveMaxUsesPerRound(value) {
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0 && Number.isInteger(n)) return n;
  return 1;
}

function normalizeSkillTemplatePayload(body) {
  return {
    name: cleanText(body.name),
    rank: cleanText(body.rank),
    skillType: cleanText(body.skillType),
    // 宝具子类型（对人/对军/对城…），仅宝具类模板使用
    npType: cleanText(body.npType),
    timing: cleanText(body.timing),
    positionLimit: cleanText(body.positionLimit),
    manaCost: Number(body.manaCost) || 0,
    cooldown: Number(body.cooldown) || 0,
    // 每回合最大发动次数：0=不限（魔境这类），缺省=1；注意 Number(0)||1 会把 0 吃掉，必须先判
    maxUsesPerRound: resolveMaxUsesPerRound(body.maxUsesPerRound),
    statModifiers: cleanJsonText(body.statModifiers, {}),
    winRateModifier: Number(body.winRateModifier) || 0,
    enemyWinRateModifier: Number(body.enemyWinRateModifier) || 0,
    statusEffects: cleanText(body.statusEffects),
    effectsJson: cleanJsonText(body.effects ?? body.effectsJson, []),
    conditionsJson: cleanJsonText(body.conditions ?? body.conditionsJson, []),
    manualJudgment: body.manualJudgment ? 1 : 0,
    sourceBook: cleanText(body.sourceBook),
    sourceSection: cleanText(body.sourceSection),
    rawText: cleanText(body.rawText),
    notes: cleanText(body.notes),
  };
}

function formatSkillTemplateRow(row) {
  return {
    id: row.id,
    name: row.name,
    rank: row.rank,
    skillType: row.skill_type,
    npType: row.np_type,
    timing: row.timing,
    positionLimit: row.position_limit,
    manaCost: row.mana_cost ?? 0,
    cooldown: row.cooldown ?? 0,
    maxUsesPerRound: row.max_uses_per_round ?? 1,
    statModifiers: row.stat_modifiers,
    winRateModifier: row.win_rate_modifier ?? 0,
    enemyWinRateModifier: row.enemy_win_rate_modifier ?? 0,
    statusEffects: row.status_effects,
    effects: parseJsonText(row.effects_json, []),
    conditions: parseJsonText(row.conditions_json, []),
    effectsJson: row.effects_json,
    conditionsJson: row.conditions_json,
    manualJudgment: Boolean(row.manual_judgment),
    sourceBook: row.source_book,
    sourceSection: row.source_section,
    rawText: row.raw_text,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  cleanText,
  cleanJsonText,
  parseJsonText,
  normalizeSkillTemplatePayload,
  formatSkillTemplateRow,
};
