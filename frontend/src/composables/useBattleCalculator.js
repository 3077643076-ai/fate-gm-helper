/**
 * 战斗表结算逻辑
 * 基于 Excel 战斗表公式移植
 */

// ---------- 常量 ----------

/** 属性对比得分：优=3, 平=2, 劣=1 */
const SCORE_MAP = { 优: 3, 平: 2, 劣: 1 }

/**
 * 3属性对比总分 → 基础胜率映射
 * Excel D86 公式:
 * 9(3优)→90, 8(2优1平)→80
 * 7→有劣70, 无劣60
 * 6(3平)→50
 * 5→1优2劣30, 2平1劣40
 * 4(1平2劣)→20
 * 3(3劣)→10
 */
function mapScoreToBaseRate(totalScore, hasYou, hasLie) {
  switch (totalScore) {
    case 9: return 90  // 3优
    case 8: return 80  // 2优1平
    case 7: return hasLie ? 70 : 60  // 1优2平=60, 2优1劣=70
    case 6: return 50  // 3平 / 1优1平1劣
    case 5:
      if (hasYou) return 30            // 1优2劣
      return 40                         // 2平1劣
    case 4: return 20  // 1平2劣
    case 3: return 10  // 3劣
    default: return 50
  }
}

// ---------- 对外 API ----------

/**
 * 计算魔力不足惩罚
 * @param {number} currentMana 当前魔力
 * @param {number} consumption 消耗魔力
 * @returns {{remaining: number, penalty: number, penaltyHalf: number, level: string}}
 */
export function calcManaShortage(currentMana, consumption) {
  const remaining = currentMana - (consumption || 0)
  const penalty = remaining < 0 ? Math.floor(Math.abs(remaining) / 20) * 10 : 0
  const penaltyHalf = Math.floor(penalty / 2)

  let level = '正常'
  if (remaining <= -80) level = '低于-80（-40）'
  else if (remaining <= -60) level = '低于-60（-30）/ 单独行动-140（-35）'
  else if (remaining <= -40) level = '低于-40（-20）/ 单独行动-100（-25）'
  else if (remaining <= -20) level = '低于-20（-10）/ 单独行动-60（-15）'
  else if (remaining < 0) level = '高于-20'

  return { remaining, penalty, penaltyHalf, level }
}

/**
 * 对比双方单个属性，返回优/平/劣
 * @param {number} blueVal 蓝方属性值
 * @param {number} yellowVal 黄方属性值
 * @returns {{result: string, score: number, diff: number}}
 */
export function compareOneStat(blueVal, yellowVal) {
  const b = Number(blueVal) || 0
  const y = Number(yellowVal) || 0
  const diff = b - y
  let result, score
  if (diff > 0) { result = '优'; score = 3 }
  else if (diff < 0) { result = '劣'; score = 1 }
  else { result = '平'; score = 2 }
  return { result, score, diff }
}

/**
 * 对比双方多个属性
 * @param {Object} blueStats 蓝方属性 {endurance, strength, noblePhantasm, level}
 * @param {Object} yellowStats 黄方属性
 * @param {string[]} keys 要对比的属性名数组，默认 ['endurance','strength','noblePhantasm']
 * @returns {{comparisons: Array, totalScore: number, baseWinRate: number, summary: string}}
 */
export function compareStats(blueStats, yellowStats, keys) {
  const k = keys || ['endurance', 'strength', 'noblePhantasm']
  const comparisons = []
  let totalScore = 0
  let hasYou = false
  let hasLie = false

  for (const key of k) {
    const { result, score, diff } = compareOneStat(blueStats[key], yellowStats[key])
    comparisons.push({ key, blueValue: Number(blueStats[key]) || 0, yellowValue: Number(yellowStats[key]) || 0, result, score, diff })
    totalScore += score
    if (result === '优') hasYou = true
    if (result === '劣') hasLie = true
  }

  const baseWinRate = mapScoreToBaseRate(totalScore, hasYou, hasLie)

  const youCount = comparisons.filter(c => c.result === '优').length
  const pingCount = comparisons.filter(c => c.result === '平').length
  const lieCount = comparisons.filter(c => c.result === '劣').length

  let summary = ''
  if (youCount > 0) summary += `${youCount}优`
  if (pingCount > 0) summary += `${pingCount}平`
  if (lieCount > 0) summary += `${lieCount}劣`

  return { comparisons, totalScore, baseWinRate, summary }
}

/**
 * 获取属性对比的标签名
 */
export const STAT_LABELS = {
  level: '等级',
  strength: '筋力',
  endurance: '耐力',
  agility: '敏捷',
  mana: '魔力',
  luck: '幸运',
  noblePhantasm: '宝具',
}

/**
 * 默认战斗属性占位：蓝方主要属性、黄方主要属性、随机属性。
 * 实战时应在初始工序结算后按双方提交和骰点结果改成真实三项。
 */
export const DEFAULT_COMPARE_KEYS = ['strength', 'endurance', 'luck']

/**
 * 计算最终胜率
 * @param {Object} params
 * @param {number} params.baseWinRate      基础胜率 (D列, 10~90)
 * @param {number} params.levelDiff        主力等级差 (C列, 蓝主力等级-黄主力等级)
 * @param {number} params.attrDiff         战斗属性差 (E列, 蓝总值-黄总值)
 * @param {number} params.bluePreBattle    蓝方战前胜率 (F列)
 * @param {number} params.yellowPreBattle  黄方战前胜率
 * @param {number} params.blueInitial      蓝方初始胜率 (G列)
 * @param {number} params.yellowInitial    黄方初始胜率
 * @param {number} params.blueMain         蓝方主要胜率 (H列)
 * @param {number} params.yellowMain       黄方主要胜率
 * @param {number} params.blueGuarantee    蓝方保底
 * @param {number} params.yellowGuarantee  黄方保底
 * @returns {{blueFinal: number, yellowFinal: number, blueK: number, yellowK: number, halved: number}}
 */
export function calcFinalWinRate({
  baseWinRate = 50,
  levelDiff = 0,
  attrDiff = 0,
  bluePreBattle = 0,
  yellowPreBattle = 0,
  blueInitial = 0,
  yellowInitial = 0,
  blueMain = 0,
  yellowMain = 0,
  blueGuarantee = 0,
  yellowGuarantee = 0,
} = {}) {
  // 蓝方累计 = 主力等级差 + 基础 + 属性差 + 战前 + 初始 + 主要
  const blueAdj = levelDiff + baseWinRate + attrDiff + bluePreBattle + blueInitial + blueMain
  // 黄方累计 = 反向等级差 + (100-基础) + 反向属性差 + 黄方战前 + 黄方初始 + 黄方主要
  const yellowAdj = (-levelDiff) + (100 - baseWinRate) + (-attrDiff) + yellowPreBattle + yellowInitial + yellowMain

  // 双方胜率 K = 己方累计 - 对方累计（这里对方累计只扣战前/初始/主要）
  const blueK = blueAdj - yellowPreBattle - yellowInitial - yellowMain
  const yellowK = yellowAdj - bluePreBattle - blueInitial - blueMain

  // 差值减半
  const halvedBlue = (blueK + 50) / 2

  // 最终胜率 = CLAMP(差值减半, 己方保底, 100-对方保底), >= 0
  const upperBound = 100 - yellowGuarantee
  let finalBlue = Math.max(blueGuarantee, Math.min(halvedBlue, upperBound))
  finalBlue = Math.max(0, Math.min(100, finalBlue))

  return {
    baseWinRate,
    levelDiff,
    attrDiff,
    bluePreBattle,
    yellowPreBattle,
    blueInitial,
    yellowInitial,
    blueMain,
    yellowMain,
    blueK,
    yellowK,
    halved: halvedBlue,
    blueFinal: finalBlue,
    yellowFinal: 100 - finalBlue,
  }
}
