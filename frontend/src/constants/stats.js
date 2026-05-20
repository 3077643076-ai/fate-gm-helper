// 角色卡属性键名映射（合计/基础/补正 三组）
// 供 useExcelParser 和 useCharacterCardParser 共用
export const STAT_KEYS = {
  level: ['合计等级', '基础等级', '补正等级'],
  strength: ['合计筋力', '基础筋力', '补正筋力'],
  endurance: ['合计耐久', '基础耐久', '补正耐久'],
  agility: ['合计敏捷', '基础敏捷', '补正敏捷'],
  mana: ['合计魔力', '基础魔力', '补正魔力'],
  luck: ['合计幸运', '基础幸运', '补正幸运'],
  noblePhantasm: ['合计宝具', '基础宝具', '补正宝具'],
}

// 战斗表格中显示的中文标签
export const STAT_LABELS = ['等级', '筋力', '耐力', '敏捷', '魔力', '幸运', '宝具']
