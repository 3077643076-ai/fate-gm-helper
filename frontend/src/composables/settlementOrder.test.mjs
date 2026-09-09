import assert from 'node:assert/strict'
import {
  ABILITY_CHAIN,
  NOBLE_PHANTASM_TYPE_CHAIN,
  SKILL_TYPE_CHAIN,
  RANK_CHAIN,
  chainIndex,
  normalizeChainRank,
  isKnownRank,
  isKnownType,
  getSettlementSortKey,
  compareBySettlementChain,
  sortSkillsBySettlementChain,
  sortEffectsByEffectChain,
  groupSkillsByCharacter,
} from './settlementOrder.js'

// ============ 链序与归一化 ============

// 职介/职阶互认
assert.equal(chainIndex(SKILL_TYPE_CHAIN, '职阶'), 0)
assert.equal(chainIndex(SKILL_TYPE_CHAIN, '职介'), 0)
// "对城宝具" 去后缀后匹配宝具类型链
assert.equal(chainIndex(NOBLE_PHANTASM_TYPE_CHAIN, '对城宝具'), 5)
// "宝具" 本身不被误删，能力链正常命中
assert.equal(chainIndex(ABILITY_CHAIN, '宝具'), 0)
assert.equal(chainIndex(ABILITY_CHAIN, '技能'), 1)
// 未知值排最后
assert.equal(chainIndex(ABILITY_CHAIN, '圣杯'), 9999)
assert.equal(chainIndex(ABILITY_CHAIN, ''), 9999)

// 等级归一：A+ 按 A；[-] 归 '-'；EX 保持
assert.equal(normalizeChainRank('A+'), 'A')
assert.equal(normalizeRankText('[-]'), '-')
assert.equal(normalizeChainRank('ex'), 'EX')
assert.equal(normalizeChainRank(''), '')
assert.equal(isKnownRank('B++'), true)
assert.equal(isKnownRank(''), false)
assert.equal(isKnownRank('S'), false)

assert.equal(isKnownType({ abilityKind: '宝具', npType: '对军' }), true)
assert.equal(isKnownType({ abilityKind: '宝具', npType: '' }), false)
assert.equal(isKnownType({ abilityKind: '技能', skillType: '魔术' }), true)
assert.equal(isKnownType({ abilityKind: '技能', skillType: '固有' }), false)

function normalizeRankText(text) {
  return normalizeChainRank(text)
}

// ============ 多级排序：能力 → 类型 → 等级 ============

// 依次应为：对界宝具 → 对人宝具 → 对军宝具 → 魔术技能 → 职介技能(未知等级排同级后面按名排) → 礼装
const items = [
  { skillName: '誓约胜利之剑', abilityKind: '宝具', npType: '对城', originalRank: 'A++', effectiveRank: 'A' },
  { skillName: '王之财宝', abilityKind: '宝具', npType: '对界', originalRank: 'E~A++', effectiveRank: 'E~A++' },
  { skillName: '开通王财', abilityKind: '宝具', npType: '对人', originalRank: 'B+', effectiveRank: 'B+' },
  { skillName: '魔术礼装加护', abilityKind: '礼装', skillType: '', originalRank: 'C' },
  { skillName: '魔力放出', abilityKind: '技能', skillType: '魔术', originalRank: 'B' },
  { skillName: '对魔力', abilityKind: '技能', skillType: '职介', originalRank: 'A' },
  { skillName: '千里眼', abilityKind: '技能', skillType: '不存在的类型', originalRank: 'C' },
]

const sorted = sortSkillsBySettlementChain(items)
const sortedNames = sorted.map(item => item.skillName)

assert.deepEqual(sortedNames, [
  '开通王财',       // 对人（链序 2）
  '誓约胜利之剑',   // 对城（链序 5）
  '王之财宝',       // 对界（链序 7，宝具类型链最后）
  '对魔力',         // 技能-职介
  '魔力放出',       // 技能-魔术
  '千里眼',         // 技能-未知类型，排最后
  '魔术礼装加护',   // 能力链里礼装排技能之后
])

// 同链同级：等级链 EX→A→B→C→D→E→[-]
const rankItems = [
  { skillName: '甲', abilityKind: '技能', skillType: '天赋', effectiveRank: 'B' },
  { skillName: '乙', abilityKind: '技能', skillType: '天赋', effectiveRank: 'EX' },
  { skillName: '丙', abilityKind: '技能', skillType: '天赋', effectiveRank: '[-]' },
  { skillName: '丁', abilityKind: '技能', skillType: '天赋', effectiveRank: 'A+' },
]
assert.deepEqual(
  sortSkillsBySettlementChain(rankItems).map(item => item.skillName),
  ['乙', '丁', '甲', '丙']
)

// 排序键独立可用
const key = getSettlementSortKey({ skillName: '变转の魔杖', abilityKind: '宝具', npType: '对人魔剑', effectiveRank: 'C' })
assert.equal(key.ability, 0)
assert.equal(key.type, 0)
assert.equal(key.rank, chainIndex(RANK_CHAIN, 'C'))

// ============ 5.2.1 效果链排序 ============

const effects = [
  { kind: 'mana_cost', value: 20 },
  { kind: 'win_rate_modifier', value: 10 },
  { kind: 'status_effect', label: '中毒' },
  { kind: 'stat_modifier', stat: 'strength', value: 20 },
  { kind: 'bombard_instant_death', label: '轰击' },
]
assert.deepEqual(
  sortEffectsByEffectChain(effects).map(effect => effect.kind),
  ['bombard_instant_death', 'status_effect', 'stat_modifier', 'win_rate_modifier', 'mana_cost']
)

// ============ 按人物分组 ============

const grouped = groupSkillsByCharacter([
  { side: 'blue', characterName: 'Saber 阿尔托莉雅', skillName: '直感', abilityKind: '技能', skillType: '天赋', effectiveRank: 'B' },
  { side: 'blue', characterName: 'Saber 阿尔托莉雅', skillName: '誓约胜利之剑', abilityKind: '宝具', npType: '对城', effectiveRank: 'A' },
  { side: 'yellow', characterName: 'Archer 吉尔伽美什', skillName: '王之财宝', abilityKind: '宝具', npType: '对界', effectiveRank: 'E~A++' },
])
assert.equal(grouped.length, 2)
assert.equal(grouped[0].characterName, 'Saber 阿尔托莉雅')
// 组内：宝具排在技能前
assert.equal(grouped[0].items[0].skillName, '誓约胜利之剑')
assert.equal(grouped[1].items[0].skillName, '王之财宝')

// 排序不改原数组
const original = [{ skillName: '乙', abilityKind: '技能', skillType: '天赋', effectiveRank: 'B' }, { skillName: '甲', abilityKind: '技能', skillType: '天赋', effectiveRank: 'A' }]
sortSkillsBySettlementChain(original)
assert.equal(original[0].skillName, '乙')

console.log('settlementOrder.test.mjs 全部通过')
