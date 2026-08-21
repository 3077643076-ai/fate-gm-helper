/**
 * 从者资源点（RP）自动统计
 *
 * 规则依据：空想圣杯 RC1.1.5
 * - 从者建卡拥有 24 RP
 * - 1RP = 10 属性点（分配时必须为5的倍数，单属性分配上限60）
 * - 技能：A=5 B=4 C=3 D=2 E=1 EX=7
 * - 宝具：A=5 B=4 C=3 D=2 E=1 EX=9
 * - 职阶技能基础等级为E（由职介免费提供）
 * - 宝具栏：1个免费，额外+2RP/个
 * - 加符：2RP/个，建卡时每个技能宝具至多1个
 */

// 各职介提供的免费基础属性（筋力-耐久-敏捷-魔力-幸运-宝具）
const CLASS_BASE_STATS = {
  Saber:    { strength: 20, endurance: 30, agility: 20, mana: 10, luck: 20, np: 0 },
  Lancer:   { strength: 10, endurance: 10, agility: 30, mana: 10, luck: 10, np: 0 },
  Archer:   { strength: 10, endurance: 10, agility: 10, mana:  0, luck: 20, np: 0 },
  Rider:    { strength:  0, endurance: 30, agility:  0, mana:  0, luck: 20, np: 0 },
  Caster:   { strength:  0, endurance:  0, agility:  0, mana: 30, luck:  0, np: 0 },
  Assassin: { strength:  0, endurance:  0, agility: 20, mana:  0, luck: 20, np: 0 },
  Berserker:{ strength:  0, endurance:  0, agility:  0, mana:  0, luck:  0, np: 0 },
}

// 等级对应关系（用于从技能名中提取）
const RANK_COST = { 'EX': 7, 'A': 5, 'B': 4, 'C': 3, 'D': 2, 'E': 1 }
const NP_RANK_COST = { 'EX': 9, 'A': 5, 'B': 4, 'C': 3, 'D': 2, 'E': 1 }

// 宝具等级 → 宝具属性值
const NP_RANK_TO_STAT = { 'EX': 60, 'A': 50, 'B': 40, 'C': 30, 'D': 20, 'E': 10, '-': 0 }

// Berserker 职介特性：筋力/耐久/敏捷分配上限+20，幸运/魔力分配上限-20
const BERSERKER_LIMIT_BONUS = ['strength', 'endurance', 'agility']
const BERSERKER_LIMIT_PENALTY = ['luck', 'mana']

/**
 * 从技能名中提取等级
 * 例："对魔力B" → "B", "魔力放出A" → "A", "誓约胜利之剑EX" → "EX"
 */
function extractRank(name) {
  if (!name) return null
  // 先移除末尾括号注释，再匹配等级标记：EX, A, B, C, D, E（可能带+/-符号）
  const cleaned = name.replace(/\(.*?\)/g, '').trim()
  const m = cleaned.match(/(EX|[A-E])[+-]?$/)
  return m ? m[1] : null
}

/**
 * 检测加符（技能名中含+号且不是等级的一部分）
 * 例："暗夜太阳船A+" → has 加符
 * "A+" rank is A with 加符
 */
function hasPlusMark(name) {
  if (!name) return false
  return /[+]$/.test(name.trim()) || /[A-E][+]$/.test(name.trim())
}

/**
 * 判断是否为职阶技能（从职介自动获得的技能）
 * 职介技能包括：对魔力、骑乘、单独行动、阵地制作、道具制作、气息遮蔽、狂化
 */
const CLASS_SKILL_NAMES = ['对魔力', '骑乘', '单独行动', '阵地制作', '道具制作', '气息遮蔽', '狂化', '气息遮断']

function isClassSkill(name) {
  if (!name) return false
  const baseName = name.replace(/(EX|[A-E][+-]?)$/, '').trim()
  return CLASS_SKILL_NAMES.some(s => baseName.includes(s) || s.includes(baseName))
}

/**
 * 计算从者RP消耗
 * @param {Object} cardData - 解析后的角色卡数据
 * @returns {Object} RP统计结果
 */
export function useRPChecker() {

  function calculateRP(cardData) {
    if (!cardData || cardData.cardType === 'MASTER') {
      return null // 御主卡暂不计算
    }

    const { className, baseStats, classSkills, personalSkills, noblePhantasms } = cardData
    const classBase = CLASS_BASE_STATS[className]

    const breakdown = []
    let totalRP = 0

    // ========== 1. 属性 RP ==========
    let totalAllocated = 0
    const attrDetails = []
    const attrKeys = [
      { key: 'strength', label: '筋力' },
      { key: 'endurance', label: '耐久' },
      { key: 'agility', label: '敏捷' },
      { key: 'mana', label: '魔力' },
      { key: 'luck', label: '幸运' },
    ]

    for (const { key, label } of attrKeys) {
      const baseVal = baseStats?.[key] || 0
      const classVal = classBase ? (classBase[key] || 0) : 0
      const allocated = Math.max(0, baseVal - classVal)

      // 检查分配上限（默认60，Berserker有调整）
      let maxAlloc = 60
      if (className === 'Berserker') {
        if (BERSERKER_LIMIT_BONUS.includes(key)) maxAlloc = 80
        if (BERSERKER_LIMIT_PENALTY.includes(key)) maxAlloc = 40
      }

      totalAllocated += allocated
      attrDetails.push({
        label,
        base: baseVal,
        classBase: classVal,
        allocated,
        maxAlloc,
        overLimit: allocated > maxAlloc,
      })
    }

    // 等级属性：由时代决定，不计入RP消耗，但展示
    const levelBase = baseStats?.level || 0

    // 宝具属性：由宝具等级决定，不计入属性分配
    const npBase = baseStats?.noblePhantasm || 0
    const highestNpRank = getHighestNpRank(noblePhantasms)
    const expectedNpStat = NP_RANK_TO_STAT[highestNpRank] || 0
    // 如果有加符的宝具，+5
    const npPlusBonus = (noblePhantasms || []).filter(np => hasPlusMark(np.name)).length * 5
    const expectedNpTotal = expectedNpStat + npPlusBonus

    const attrRP = totalAllocated / 10

    breakdown.push({
      category: '属性分配',
      rp: attrRP,
      detail: attrDetails,
      note: `等级(${levelBase})由时代决定，宝具属性(${npBase})由宝具等级决定，均不消耗RP`,
    })
    totalRP += attrRP

    // ========== 2. 宝具栏位 RP ==========
    const npCount = (noblePhantasms || []).length
    const extraSlots = Math.max(0, npCount - 1)
    const slotRP = extraSlots * 2

    if (extraSlots > 0) {
      breakdown.push({
        category: '额外宝具栏',
        rp: slotRP,
        detail: `${npCount}个宝具（免费1个 + 额外${extraSlots}个 × 2RP）`,
      })
      totalRP += slotRP
    }

    // ========== 3. 技能 RP ==========
    const allSkills = [
      ...(classSkills || []).map(s => ({ ...s, isClass: true })),
      ...(personalSkills || []).map(s => ({ ...s, isClass: false })),
    ]

    const skillDetails = []
    let skillRP = 0

    for (const skill of allSkills) {
      const rank = extractRank(skill.name)
      if (!rank) {
        skillDetails.push({ name: skill.name, rank: '?', cost: 0, note: '无法识别等级' })
        continue
      }

      const cost = RANK_COST[rank] || 0
      const plus = hasPlusMark(skill.name)
      const plusCost = plus ? 2 : 0
      const totalCost = cost + plusCost

      skillRP += totalCost
      skillDetails.push({
        name: skill.name,
        rank,
        cost: totalCost,
        baseCost: cost,
        plusCost,
        isClass: skill.isClass,
        note: skill.isClass
          ? `职阶技能(基础E免费)，${rank}级=${cost}RP${plus ? ' + 加符2RP' : ''}`
          : `保有技能，${rank}级=${cost}RP${plus ? ' + 加符2RP' : ''}`,
      })
    }

    breakdown.push({
      category: '技能',
      rp: skillRP,
      detail: skillDetails,
    })
    totalRP += skillRP

    // ========== 4. 宝具 RP ==========
    const npDetails = []
    let npRP = 0

    for (const np of (noblePhantasms || [])) {
      const rank = extractRank(np.name)
      if (!rank) {
        npDetails.push({ name: np.name, rank: '?', cost: 0, note: '无法识别等级' })
        continue
      }

      const cost = NP_RANK_COST[rank] || 0
      const plus = hasPlusMark(np.name)
      const plusCost = plus ? 2 : 0
      const totalCost = cost + plusCost

      npRP += totalCost
      npDetails.push({
        name: np.name,
        rank,
        cost: totalCost,
        baseCost: cost,
        plusCost,
        note: `宝具${rank}级=${cost}RP${plus ? ' + 加符2RP' : ''}`,
      })
    }

    breakdown.push({
      category: '宝具',
      rp: npRP,
      detail: npDetails,
    })
    totalRP += npRP

    // ========== 汇总 ==========
    const BASELINE = 24
    const over = totalRP - BASELINE

    return {
      totalRP: Math.round(totalRP * 10) / 10,
      baseline: BASELINE,
      over: Math.round(over * 10) / 10,
      isOver: over > 0,
      breakdown,
      // 附加诊断信息
      attrTotalAllocated: totalAllocated,
      attrRP: Math.round(attrRP * 10) / 10,
      skillRP,
      npRP,
      slotRP,
      levelBase,
      npBase,
      expectedNpStat: expectedNpTotal,
      npMatchExpected: npBase === expectedNpTotal,
      highestNpRank,
    }
  }

  function getHighestNpRank(noblePhantasms) {
    if (!noblePhantasms || noblePhantasms.length === 0) return '-'
    const rankOrder = { 'EX': 7, 'A': 6, 'B': 5, 'C': 4, 'D': 3, 'E': 2, '-': 1 }
    let highest = '-'
    let highestVal = 0
    for (const np of noblePhantasms) {
      const rank = extractRank(np.name)
      const val = rankOrder[rank] || 0
      if (val > highestVal) {
        highestVal = val
        highest = rank
      }
    }
    return highest
  }

  /**
   * 快速检查单个属性是否超出分配上限
   */
  function checkAllocationLimit(className, attrKey, baseValue) {
    const classBase = CLASS_BASE_STATS[className]
    if (!classBase) return { ok: true, allocated: 0, max: 60, over: false }

    const classVal = classBase[attrKey] || 0
    const allocated = Math.max(0, baseValue - classVal)
    let maxAlloc = 60
    if (className === 'Berserker') {
      if (BERSERKER_LIMIT_BONUS.includes(attrKey)) maxAlloc = 80
      if (BERSERKER_LIMIT_PENALTY.includes(attrKey)) maxAlloc = 40
    }

    return {
      ok: allocated <= maxAlloc,
      allocated,
      max: maxAlloc,
      over: allocated > maxAlloc,
    }
  }

  return { calculateRP, checkAllocationLimit, extractRank, CLASS_BASE_STATS }
}
