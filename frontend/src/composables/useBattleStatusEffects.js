import { createStatusEffect } from '../services/statusEffects.js'

const ACTIVE_STATUS_SET = new Set(['AUTO_ON', 'APPLIED'])

function parseJson(value, fallback) {
  if (!value) return fallback
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { return fallback }
}

function normalizeStatusEffect(raw) {
  if (!raw) return null
  if (typeof raw === 'string') return createStatusEffect(raw, 1)

  const name = raw.name || raw.effectName || raw.label || raw.text
  if (!name) return null
  return createStatusEffect(name, Number(raw.level ?? raw.value) || 1)
}

function getTemplateEffects(template) {
  if (!template) return []
  if (Array.isArray(template.effects)) return template.effects
  const parsed = parseJson(template.effectsJson, [])
  return Array.isArray(parsed) ? parsed : []
}

function getLegacyStatusEffects(template) {
  const parsed = parseJson(template?.statusEffects, [])
  if (Array.isArray(parsed)) return parsed
  if (typeof template?.statusEffects === 'string' && template.statusEffects.trim()) return [template.statusEffects.trim()]
  return []
}

function getTargetCharacterId(item) {
  // 默认把状态写回技能持有者；复杂目标仍然交给 GM 手动裁决。
  if (item.targetCharacterId) return item.targetCharacterId
  if (!item.target || item.target === 'self') return item.characterId
  return null
}

export function collectStatusEffectsByCharacter(queue = []) {
  const byCharacter = new Map()

  for (const item of queue) {
    if (!ACTIVE_STATUS_SET.has(item.status)) continue
    if (item.manualJudgment) continue

    const characterId = getTargetCharacterId(item)
    if (!characterId) continue

    const rawEffects = [
      ...getLegacyStatusEffects(item.template),
      ...getTemplateEffects(item.template).filter(effect => effect.kind === 'status_effect' || effect.kind === 'status'),
    ]

    for (const rawEffect of rawEffects) {
      const normalized = normalizeStatusEffect(rawEffect)
      if (!normalized) continue
      if (!byCharacter.has(characterId)) byCharacter.set(characterId, [])
      byCharacter.get(characterId).push({
        ...normalized,
        sourceSkill: item.skillName,
      })
    }
  }

  return byCharacter
}

export function formatStatusEffectNotes(effects = []) {
  return effects.map(effect => `${effect.name}${effect.level > 1 ? `(${effect.level})` : ''}`).join('、')
}
