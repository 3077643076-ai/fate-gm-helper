// ============ 规则书 5.2 结算链 ============
// 这个文件是"结算顺序"的唯一数据源：排序、录入页下拉都从这里取常量。
// 链的顺序就是规则书原文的顺序，改顺序等于改规则，务必对照规则书 5.2 修改。

// 5.2.1 效果的结算链：单个技能/宝具内部多个效果的处理顺序
// kind 取值与技能模板 effects JSON 的 kind 字段对应
export const EFFECT_KIND_CHAIN = [
  'bombard_instant_death', // 轰击/即死
  'status_effect',         // 状态
  'stat_modifier',         // 属性修正
  'stat_group_modifier',   // 属性组修正（全属性/非宝具/上三属性）
  'select_stat_modifier',  // 自选属性修正
  'win_rate_modifier',     // 胜率修正
  'enemy_win_rate_modifier', // 敌方胜率修正
  'guarantee_modifier',    // 底限胜率/保底
  'mana_cost',             // 魔力修正
  'text',                  // 文本/其他
]

// 5.2.2 能力的结算链：宝具 → 技能 → 工房构件/神殿构件/礼装
export const ABILITY_CHAIN = ['宝具', '技能', '工房构件', '神殿构件', '礼装']

// 5.2.3.1 宝具类型的结算链
export const NOBLE_PHANTASM_TYPE_CHAIN = ['对人魔剑', '视为对人', '对人', '对军', '视为对城', '对城', '结界', '对界']

// 5.2.3.2 技能类型的结算链
export const SKILL_TYPE_CHAIN = ['职介', '天赋', '技艺', '祝福', '荣冠', '兵器', '魔术']

// 5.2.4 等级的结算链：[-] 表示无法标定等级
export const RANK_CHAIN = ['EX', 'A', 'B', 'C', 'D', 'E', '-']

// 5.2.5 时机的结算链：常驻 → 指定工序 → 随时
// 指定工序内部的先后由战斗表 PHASES 顺序决定（战斗开始时→初始→主要→最终）
export const TIMING_CHAIN = ['常驻', '战斗开始时', '初始工序', '主要工序', '最终工序', '随时']

// 不在链上的值（未填/自定义/旧数据）统一排到链的最后，并可以标记出来提醒 GM
export const UNKNOWN_INDEX = 9999

// 链内名称归一：去空格 + 别名互认 + 转小写
// 例如卡片上写"职阶技能"、规则书写"职介"，视为同一类型
function normalizeChainName(text) {
  let normalized = String(text || '')
    .replace(/\s+/g, '')
    .replace(/职阶/g, '职介')
    .replace(/固有/g, '')
    .toLowerCase()
  // "对城宝具" → "对城"：去掉结尾的"宝具"后缀；单独的"宝具"值本身不受影响
  if (normalized.length > 2 && normalized.endsWith('宝具')) {
    normalized = normalized.slice(0, -2)
  }
  return normalized
}

// 查一个值在链中的位置；不在链上返回 UNKNOWN_INDEX（排最后）
export function chainIndex(chain, value) {
  const normalized = normalizeChainName(value)
  if (!normalized) return UNKNOWN_INDEX
  const index = chain.findIndex(item => normalizeChainName(item) === normalized)
  return index >= 0 ? index : UNKNOWN_INDEX
}

// 等级归一：A+ / A++ 都按 A 查链；[-]、[-]带括号、空 都归 '-'
export function normalizeChainRank(rank) {
  const text = String(rank || '').toUpperCase().replace(/[[\]()（）]/g, '').trim()
  if (!text) return ''
  if (/^-+$/.test(text)) return '-'
  const match = text.match(/EX|[A-E]/)
  return match ? match[0] : ''
}

// 判断某个等级是否在等级链上（用于面板提示"未知等级"）
export function isKnownRank(rank) {
  const normalized = normalizeChainRank(rank)
  return normalized !== '' && chainIndex(RANK_CHAIN, normalized) !== UNKNOWN_INDEX
}

// 判断类型是否在对应链上（宝具看宝具类型链，其他看技能类型链）
export function isKnownType(item = {}) {
  const chain = item.abilityKind === '宝具' ? NOBLE_PHANTASM_TYPE_CHAIN : SKILL_TYPE_CHAIN
  const value = item.abilityKind === '宝具' ? item.npType : item.skillType
  return chainIndex(chain, value) !== UNKNOWN_INDEX
}

// 计算一个队列条目的结算链排序键
// 依次比较：能力 → 类型 → 等级 → 名字（同链同级按名字排，保证顺序稳定）
export function getSettlementSortKey(item = {}) {
  const isNoble = item.abilityKind === '宝具'
  return {
    ability: chainIndex(ABILITY_CHAIN, item.abilityKind),
    type: isNoble
      ? chainIndex(NOBLE_PHANTASM_TYPE_CHAIN, item.npType)
      : chainIndex(SKILL_TYPE_CHAIN, item.skillType),
    rank: chainIndex(RANK_CHAIN, normalizeChainRank(item.effectiveRank || item.originalRank)),
    name: String(item.skillName || ''),
  }
}

export function compareBySettlementChain(a, b) {
  const keyA = getSettlementSortKey(a)
  const keyB = getSettlementSortKey(b)
  for (const key of ['ability', 'type', 'rank']) {
    if (keyA[key] !== keyB[key]) return keyA[key] - keyB[key]
  }
  return keyA.name.localeCompare(keyB.name, 'zh-Hans-CN')
}

// 返回排好序的新数组（不改原数组）
export function sortSkillsBySettlementChain(items = []) {
  return [...items].sort(compareBySettlementChain)
}

// 单个技能/宝具内部的效果按 5.2.1 效果链排序
export function sortEffectsByEffectChain(effects = []) {
  return [...effects].sort(
    (a, b) => chainIndex(EFFECT_KIND_CHAIN, a.kind) - chainIndex(EFFECT_KIND_CHAIN, b.kind)
  )
}

// 按人物分组的结算链视图：[{ characterName, side, items: [已按链排好] }]
// 只传进来的条目会被排序，是否过滤"已生效"由调用方决定
export function groupSkillsByCharacter(items = []) {
  const groups = []
  const groupMap = new Map()
  for (const item of items) {
    const key = `${item.side}:${item.characterName}`
    if (!groupMap.has(key)) {
      const group = { key, side: item.side, characterName: item.characterName, items: [] }
      groupMap.set(key, group)
      groups.push(group)
    }
    groupMap.get(key).items.push(item)
  }
  for (const group of groups) {
    group.items = sortSkillsBySettlementChain(group.items)
  }
  return groups
}
