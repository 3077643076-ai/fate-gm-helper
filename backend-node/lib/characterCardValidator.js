// 角色卡体检规则集中放这里，后端 API 和测试脚本都可以复用。
// 以后要新增检查项，优先改这个文件，不要散落在页面里。
const STAT_LABELS = {
  strength: '筋力',
  endurance: '耐久',
  agility: '敏捷',
  mana: '魔力',
  luck: '幸运',
  noblePhantasm: '宝具',
  level: '等级',
}

const SERVANT_CLASS_BASE_STATS = {
  Saber: { strength: 20, endurance: 30, agility: 20, mana: 10, luck: 20 },
  Lancer: { strength: 10, endurance: 10, agility: 30, mana: 10, luck: 10 },
  Archer: { strength: 10, endurance: 10, agility: 10, mana: 0, luck: 20 },
  Rider: { strength: 0, endurance: 30, agility: 0, mana: 0, luck: 20 },
  Caster: { strength: 0, endurance: 0, agility: 0, mana: 30, luck: 0 },
  Assassin: { strength: 0, endurance: 0, agility: 20, mana: 0, luck: 20 },
  Berserker: { strength: 0, endurance: 0, agility: 0, mana: 0, luck: 0 },
  Avenger: { strength: 0, endurance: 0, agility: 0, mana: 0, luck: 0 },
}

const RANK_COST = { EX: 7, A: 5, B: 4, C: 3, D: 2, E: 1 }
const NP_RANK_COST = { EX: 9, A: 5, B: 4, C: 3, D: 2, E: 1 }
const NP_RANK_TO_STAT = { EX: 60, A: 50, B: 40, C: 30, D: 20, E: 10, '-': 0 }
const STAT_KEYS = ['strength', 'endurance', 'agility', 'mana', 'luck']

function parseJson(value, fallback = []) {
  if (!value) return fallback
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { return fallback }
}

function asList(value) {
  return Array.isArray(value) ? value : parseJson(value, [])
}

function extractRank(name) {
  const text = String(name || '').replace(/\(.*?\)/g, '').trim()
  const match = text.match(/(EX|[A-E])[+-]?$/)
  return match ? match[1] : ''
}

function hasPlus(name) {
  return /[A-E]\+{1,2}$/.test(String(name || '').trim())
}

function addIssue(issues, severity, code, message, path = '') {
  issues.push({ severity, code, message, path })
}

function highestNpRank(noblePhantasms = []) {
  const rankOrder = { EX: 7, A: 6, B: 5, C: 4, D: 3, E: 2, '-': 1 }
  let best = '-'
  for (const np of noblePhantasms) {
    const rank = extractRank(np.name)
    if ((rankOrder[rank] || 0) > (rankOrder[best] || 0)) best = rank
  }
  return best
}

function calculateSkillCost(items = [], table = RANK_COST) {
  let total = 0
  const details = []
  for (const item of items) {
    const rank = extractRank(item.name)
    const cost = table[rank] || 0
    const plusCost = hasPlus(item.name) ? 2 : 0
    total += cost + plusCost
    details.push({ name: item.name, rank: rank || '?', cost: cost + plusCost })
  }
  return { total, details }
}

function getServantAllocationLimit(className, statKey) {
  if (className === 'Berserker') {
    if (['strength', 'endurance', 'agility'].includes(statKey)) return 80
    if (['mana', 'luck'].includes(statKey)) return 40
  }
  return 60
}

function validateServant(card, issues) {
  const className = card.className || card.class_name || ''
  const baseStats = card.baseStats || {}
  const totalStats = card.totalStats || {}
  const correctionStats = card.correctionStats || {}
  const classSkills = asList(card.classSkills || card.class_skills)
  const personalSkills = asList(card.personalSkills || card.personal_skills)
  const noblePhantasms = asList(card.noblePhantasms || card.noble_phantasms)
  const classBase = SERVANT_CLASS_BASE_STATS[className]

  if (!className) addIssue(issues, 'error', 'missing_class', '从者卡缺少职介', 'className')
  if (!classBase) addIssue(issues, 'warning', 'unknown_class', `未知或暂未配置的职介：${className}`, 'className')

  let allocatedTotal = 0
  for (const statKey of STAT_KEYS) {
    const base = Number(baseStats[statKey]) || 0
    const total = Number(totalStats[statKey]) || 0
    const correction = Number(correctionStats[statKey]) || 0
    const expectedTotal = base + correction
    const classValue = classBase ? Number(classBase[statKey]) || 0 : 0
    const allocated = base - classValue
    allocatedTotal += Math.max(0, allocated)

    if (total !== expectedTotal) {
      addIssue(issues, 'error', 'stat_total_mismatch', `${STAT_LABELS[statKey]}合计(${total})不等于基础(${base})+补正(${correction})`, `totalStats.${statKey}`)
    }
    if (classBase && allocated < 0) {
      addIssue(issues, 'error', 'below_class_base', `${STAT_LABELS[statKey]}低于${className}职介基础值 ${classValue}`, `baseStats.${statKey}`)
    }
    if (allocated % 5 !== 0) {
      addIssue(issues, 'error', 'stat_not_multiple_of_5', `${STAT_LABELS[statKey]}分配值 ${allocated} 不是 5 的倍数`, `baseStats.${statKey}`)
    }
    const limit = getServantAllocationLimit(className, statKey)
    if (allocated > limit) {
      addIssue(issues, 'error', 'stat_allocation_over_limit', `${STAT_LABELS[statKey]}分配值 ${allocated} 超过上限 ${limit}`, `baseStats.${statKey}`)
    }
  }

  const levelTotal = Number(totalStats.level) || 0
  const expectedLevel = (Number(baseStats.level) || 0) + (Number(correctionStats.level) || 0)
  if (levelTotal !== expectedLevel) addIssue(issues, 'error', 'level_total_mismatch', `合计等级(${levelTotal})不等于基础等级+补正等级(${expectedLevel})`, 'totalStats.level')
  if (allocatedTotal > 160) addIssue(issues, 'warning', 'allocated_stats_over_lv70_budget', `五项属性分配合计 ${allocatedTotal}，已超过 Lv70 常见上限 160`, 'baseStats')

  const highestRank = highestNpRank(noblePhantasms)
  const expectedNp = (NP_RANK_TO_STAT[highestRank] || 0) + noblePhantasms.filter(np => hasPlus(np.name)).length * 5
  if ((Number(baseStats.noblePhantasm) || 0) !== expectedNp) {
    addIssue(issues, 'warning', 'noble_phantasm_stat_mismatch', `基础宝具(${baseStats.noblePhantasm || 0})与最高宝具等级 ${highestRank} 应有值(${expectedNp})不一致`, 'baseStats.noblePhantasm')
  }

  const skillCost = calculateSkillCost([...classSkills, ...personalSkills], RANK_COST)
  const npCost = calculateSkillCost(noblePhantasms, NP_RANK_COST)
  const extraNpSlotCost = Math.max(0, noblePhantasms.length - 1) * 2
  const totalRp = allocatedTotal / 10 + skillCost.total + npCost.total + extraNpSlotCost
  if (totalRp > 24) addIssue(issues, 'warning', 'servant_rp_over_budget', `从者估算消耗 ${totalRp}RP，超过常见 24RP`, 'rp')

  if (!classSkills.length) addIssue(issues, 'warning', 'missing_class_skills', '从者卡没有解析到职介技能', 'classSkills')
  if (!personalSkills.length) addIssue(issues, 'info', 'missing_personal_skills', '从者卡没有解析到保有技能', 'personalSkills')
  if (!noblePhantasms.length) addIssue(issues, 'warning', 'missing_noble_phantasms', '从者卡没有解析到宝具', 'noblePhantasms')
}

function validateMaster(card, issues) {
  const totalStats = card.totalStats || {}
  const personalSkills = asList(card.personalSkills || card.personal_skills)
  const workshops = asList(card.workshops)
  const craftEssences = asList(card.craftEssences || card.craft_essences)
  const statKeys = ['strength', 'endurance', 'agility', 'mana', 'luck', 'noblePhantasm']
  let statTotal = 0

  for (const statKey of statKeys) {
    const value = Number(totalStats[statKey]) || 0
    statTotal += value
    if (value < 0) addIssue(issues, 'error', 'master_stat_negative', `${STAT_LABELS[statKey] || '回路'}不能为负`, `totalStats.${statKey}`)
    if (value > 50 && statKey !== 'noblePhantasm') addIssue(issues, 'warning', 'master_stat_over_50', `${STAT_LABELS[statKey]}超过常见单项上限 50`, `totalStats.${statKey}`)
    if (value % 5 !== 0) addIssue(issues, 'error', 'master_stat_not_multiple_of_5', `${STAT_LABELS[statKey] || '回路'}不是 5 的倍数`, `totalStats.${statKey}`)
  }

  if ((Number(totalStats.level) || 0) <= 0) addIssue(issues, 'error', 'missing_master_level', '御主卡缺少等级', 'totalStats.level')
  if (statTotal !== 60) addIssue(issues, 'warning', 'master_stat_budget_mismatch', `御主六项合计为 ${statTotal}，常见模板应为 60`, 'totalStats')

  const skillCost = calculateSkillCost(personalSkills, RANK_COST).total
  const workshopCost = Math.max(0, workshops.length - 1)
  const essenceCost = Math.max(0, craftEssences.length - 1) * 2
  const totalRp = skillCost + workshopCost + essenceCost
  if (totalRp > 24) addIssue(issues, 'warning', 'master_rp_over_budget', `御主估算消耗 ${totalRp}RP，超过常见 24RP`, 'rp')
}

function validateCharacterCard(card = {}) {
  const issues = []
  const cardType = card.cardType || card.card_type || 'SERVANT'
  if (!card.code) addIssue(issues, 'warning', 'missing_code', '角色卡缺少代号', 'code')
  if (!card.rawText && !card.raw_text) addIssue(issues, 'info', 'missing_raw_text', '没有保存原始 .st 文本，之后不好追溯', 'rawText')

  if (cardType === 'MASTER') validateMaster(card, issues)
  else validateServant(card, issues)

  const summary = {
    errors: issues.filter(issue => issue.severity === 'error').length,
    warnings: issues.filter(issue => issue.severity === 'warning').length,
    infos: issues.filter(issue => issue.severity === 'info').length,
  }
  return { ok: summary.errors === 0, summary, issues }
}

module.exports = {
  validateCharacterCard,
  extractRank,
  highestNpRank,
}
