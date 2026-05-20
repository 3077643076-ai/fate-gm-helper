/**
 * 共享工具函数 — normalizeClassName 和 safeNullArray
 * 原本在 useCharacterCards、useCharacterStatus、BattleControl 中各有一份副本
 */

export function normalizeClassName(className) {
  if (!className) return ''
  const text = String(className).toLowerCase()
  if (text.includes('archer') || text.includes('弓')) return '弓'
  if (text.includes('lancer') || text.includes('枪') || text.includes('槍')) return '枪'
  if (text.includes('assassin') || text.includes('杀')) return '杀'
  if (text.includes('rider') || text.includes('骑')) return '骑'
  if (text.includes('saber') || text.includes('剑')) return '剑'
  if (text.includes('caster') || text.includes('术')) return '术'
  if (text.includes('berserker') || text.includes('狂')) return '狂'
  return ''
}

export function safeNullArray(len) {
  const n = Number(len) || 0
  const arr = []
  for (let i = 0; i < n; i++) arr.push(null)
  return arr
}
