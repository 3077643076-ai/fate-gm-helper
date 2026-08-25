export const PHASES = [
  { key: 'FORMATION', label: '编队' },
  { key: 'PASSIVE', label: '常驻检查' },
  { key: 'BATTLE_START', label: '战斗开始时' },
  { key: 'INITIAL', label: '初始工序' },
  { key: 'MAIN', label: '主要工序' },
  { key: 'FINAL', label: '最终工序' },
  { key: 'RESULT', label: '决胜结算' },
]

export const STATUS = {
  AUTO_ON: 'AUTO_ON',
  PENDING: 'PENDING',
  APPLIED: 'APPLIED',
  DISABLED: 'DISABLED',
  MANUAL: 'MANUAL',
}

const TIMING_TO_PHASE = {
  常驻: 'PASSIVE',
  随时: 'MAIN',
  战斗开始时: 'BATTLE_START',
  初始工序: 'INITIAL',
  主要工序: 'MAIN',
  最终工序: 'FINAL',
}

export function createDefaultPhaseState(previous = {}) {
  const phases = {}
  for (const phase of PHASES) {
    phases[phase.key] = { confirmed: Boolean(previous.phases?.[phase.key]?.confirmed) }
  }
  return { currentPhase: previous.currentPhase || 'FORMATION', phases }
}

export function reopenPhaseAndDependents(phaseState, phaseKey) {
  const startIndex = PHASES.findIndex(phase => phase.key === phaseKey)
  if (!phaseState?.phases || startIndex < 0) return []

  const reopened = []
  for (const phase of PHASES.slice(startIndex).filter(item => item.key !== 'RESULT')) {
    if (!phaseState.phases[phase.key]) phaseState.phases[phase.key] = { confirmed: false }
    if (phaseState.phases[phase.key].confirmed) reopened.push(phase.label)
    phaseState.phases[phase.key].confirmed = false
  }
  return reopened
}

export function normalizeSkillName(name) {
  return String(name || '').replace(/\s+/g, '').toLowerCase()
}

function parseJson(value, fallback) {
  if (!value) return fallback
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { return fallback }
}

function getTemplateEffects(template) {
  if (!template) return []
  if (Array.isArray(template.effects)) return template.effects
  const parsed = parseJson(template.effectsJson, [])
  return Array.isArray(parsed) ? parsed : []
}

// 从技能有效等级里取基础等级，A+ / A++ 都按 A 查表，方便 JSON 写成 { A: 30, B: 25 }。
function normalizeRank(rank) {
  const text = String(rank || '').toUpperCase().trim()
  const match = text.match(/EX|[A-E]/)
  return match ? match[0] : ''
}

// 结构化效果允许三种写法：固定 value、valueByRank、values。
// 这样同一个技能模板可以自动按角色卡上的 A/B/C/D/E 等级取正确数值。
function resolveEffectValue(effect = {}, item = {}) {
  const rank = normalizeRank(item.effectiveRank || item.originalRank || effect.rank)
  const table = effect.valueByRank || effect.values || null
  if (table && typeof table === 'object' && !Array.isArray(table)) {
    const value = table[rank] ?? table.default ?? table.DEFAULT
    return Number(value) || 0
  }
  return Number(effect.value) || 0
}

function getSideBucket(summary, side, bucket) {
  if (bucket === 'stats') return side === 'blue' ? summary.blueStats : summary.yellowStats
  return null
}

function getEnemySide(side) {
  return side === 'blue' ? 'yellow' : 'blue'
}

// 很多规则写“全属性”“宝具以外全属性”“上三属性”，这里集中展开，避免每个模板重复写 5 行。
function applyStatGroup(target, group, value) {
  const groups = {
    all: ['strength', 'endurance', 'agility', 'mana', 'luck', 'noblePhantasm'],
    non_noble: ['strength', 'endurance', 'agility', 'mana', 'luck'],
    upper_three: ['strength', 'endurance', 'agility'],
  }
  const stats = groups[group] || [group]
  for (const stat of stats) target[stat] = (target[stat] || 0) + value
}

function getPhaseForTemplate(template) {
  return TIMING_TO_PHASE[template?.timing] || 'MAIN'
}

export function buildSkillQueue({ blueSlots = [], yellowSlots = [], skillTemplateMap = new Map(), previousQueue = [] } = {}) {
  const previousById = new Map(previousQueue.map(item => [item.id, item]))
  const items = []

  const addSide = (side, slots) => {
    for (const slot of slots) {
      const card = slot.card
      if (!card) continue
      const characterName = `${card.className || ''} ${card.code || ''}`.trim()
      const lists = [card.classSkills || [], card.personalSkills || [], card.noblePhantasms || []]
      for (const list of lists) {
        for (const skill of list) {
          const skillName = skill.name || ''
          if (!skillName) continue
          const template = skillTemplateMap.get(normalizeSkillName(skillName)) || null
          const phase = getPhaseForTemplate(template)
          const id = `${side}:${slot.key}:${skillName}`
          const previous = previousById.get(id)
          const defaultStatus = phase === 'PASSIVE' ? STATUS.AUTO_ON : STATUS.PENDING
          items.push({
            id,
            side,
            position: slot.key,
            positionLabel: slot.label || slot.key,
            characterId: card.id || null,
            characterName,
            skillName,
            originalRank: skill.rank || '',
            effectiveRank: previous?.effectiveRank || skill.rank || '',
            phase,
            status: previous?.status || defaultStatus,
            selectedStat: previous?.selectedStat || '',
            target: previous?.target || 'self',
            manualJudgment: Boolean(previous?.manualJudgment || template?.manualJudgment),
            gmNote: previous?.gmNote || '',
            template,
          })
        }
      }
    }
  }

  addSide('blue', blueSlots)
  addSide('yellow', yellowSlots)
  return items
}

function emptyStats() {
  return { level: 0, strength: 0, endurance: 0, agility: 0, mana: 0, luck: 0, noblePhantasm: 0 }
}

export function resolveManualJudgmentForStatusUpdate(item = {}, nextStatus) {
  if (nextStatus === STATUS.MANUAL) return true
  return Boolean(item.template?.manualJudgment)
}

export function isNobleOrCoreSkill(item = {}) {
  const skillType = String(item.template?.skillType || '')
  const skillName = String(item.skillName || '')
  const originalRank = String(item.originalRank || '')
  return skillType.includes('宝具') || skillName.includes('宝具') || originalRank === 'EX'
}

export function applyQueueEffects({ queue = [], phaseKey = null } = {}) {
  const summary = {
    blueStats: emptyStats(),
    yellowStats: emptyStats(),
    blueWinRate: 0,
    yellowWinRate: 0,
    blueGuarantee: 0,
    yellowGuarantee: 0,
    blueManaCost: 0,
    yellowManaCost: 0,
    applied: [],
    manual: [],
  }

  const activeStatuses = new Set([STATUS.AUTO_ON, STATUS.APPLIED])
  for (const item of queue) {
    if (phaseKey && item.phase !== phaseKey) continue
    if (!activeStatuses.has(item.status)) continue
    if (item.manualJudgment || item.status === STATUS.MANUAL) {
      summary.manual.push(`${item.skillName}：需 GM 裁决`)
      continue
    }

    const effects = getTemplateEffects(item.template)
    if (!effects.length) {
      const modifiers = parseJson(item.template?.statModifiers, {})
      for (const [stat, value] of Object.entries(modifiers)) {
        const target = item.side === 'blue' ? summary.blueStats : summary.yellowStats
        target[stat] = (target[stat] || 0) + (Number(value) || 0)
      }
      if (item.side === 'blue') summary.blueWinRate += Number(item.template?.winRateModifier) || 0
      else summary.yellowWinRate += Number(item.template?.winRateModifier) || 0
      summary.applied.push(`${item.skillName}：旧模板效果已套用`)
      continue
    }

     for (const effect of effects) {
      const sidePrefix = item.side === 'blue' ? 'blue' : 'yellow'
      const targetSide = effect.target === 'enemy' ? getEnemySide(sidePrefix) : sidePrefix
      const value = resolveEffectValue(effect, item)
      if (effect.kind === 'stat_modifier' && effect.stat) {
        const target = getSideBucket(summary, targetSide, 'stats')
        target[effect.stat] = (target[effect.stat] || 0) + value
        summary.applied.push(`${item.skillName}：${effect.stat} ${value}`)
      } else if (effect.kind === 'stat_group_modifier' && effect.group) {
        const target = getSideBucket(summary, targetSide, 'stats')
        applyStatGroup(target, effect.group, value)
        summary.applied.push(`${item.skillName}：${effect.group} ${value}`)
      } else if (effect.kind === 'select_stat_modifier' && item.selectedStat) {
        const target = getSideBucket(summary, targetSide, 'stats')
        target[item.selectedStat] = (target[item.selectedStat] || 0) + value
        summary.applied.push(`${item.skillName}：${item.selectedStat} ${value}`)
      } else if (effect.kind === 'win_rate_modifier') {
        if (targetSide === 'blue') summary.blueWinRate += value
        else summary.yellowWinRate += value
        summary.applied.push(`${item.skillName}：胜率 ${value}`)
      } else if (effect.kind === 'enemy_win_rate_modifier') {
        const enemySide = getEnemySide(sidePrefix)
        if (enemySide === 'blue') summary.blueWinRate += value
        else summary.yellowWinRate += value
        summary.applied.push(`${item.skillName}：敌方胜率 ${value}`)
      } else if (effect.kind === 'guarantee_modifier') {
        if (targetSide === 'blue') summary.blueGuarantee += value
        else summary.yellowGuarantee += value
        summary.applied.push(`${item.skillName}：保底 ${value}`)
      } else if (effect.kind === 'mana_cost') {
        if (targetSide === 'blue') summary.blueManaCost += value
        else summary.yellowManaCost += value
      } else {
        summary.manual.push(`${item.skillName}：${effect.text || effect.label || '需 GM 裁决'}`)
      }
    }
  }

  return summary
}

const PHASE_LABELS = Object.fromEntries(PHASES.map(phase => [phase.key, phase.label]))

export function getPhaseWarnings({ queue = [], phaseState = createDefaultPhaseState() } = {}) {
  const warnings = []
  for (const item of queue) {
    if (item.status === STATUS.PENDING) warnings.push(`${PHASE_LABELS[item.phase] || item.phase}：${item.skillName} 待确认`)
    if (item.status === STATUS.MANUAL || item.manualJudgment) warnings.push(`${PHASE_LABELS[item.phase] || item.phase}：${item.skillName} 需 GM 裁决`)
  }
  const phasesToCheck = phaseState.phases ? PHASES.filter(phase => Object.hasOwn(phaseState.phases, phase.key)) : PHASES
  for (const phase of phasesToCheck) {
    if (['FORMATION', 'RESULT'].includes(phase.key)) continue
    if (!phaseState.phases?.[phase.key]?.confirmed) warnings.push(`${phase.label}尚未确认`)
  }
  return [...new Set(warnings)]
}
