import { updateCharacterStatus, getCharacterStatusesByCampaignAndRound } from '../services/characterStatus'
import {
  STATUS_EFFECTS, createStatusEffect,
  formatStatusEffectDisplay, getStatusType, getStatusTypeDisplayName
} from '../services/statusEffects'
import { normalizeClassName } from '../utils/helpers.js'

export function useCharacterStatus(campaignId, roundInfo, characterCards, currentTurn, characterStatuses, servantLeylineIds, masterLeylineIds, { scheduleAutoSave, saveIndicators, cancelScheduled }) {

  function getSelectedStatusEffects(slotIndex) {
    return roundInfo.value.statusEffects[slotIndex].map(effect => effect.name)
  }

  function addStatusEffect(slotIndex, effectName) {
    if (!effectName) return
    const currentEffects = roundInfo.value.statusEffects[slotIndex]
    if (currentEffects.some(e => e.name === effectName)) return
    const newEffects = [...currentEffects, createStatusEffect(effectName, 1)]
    updateStatusEffects(slotIndex, newEffects, true)
  }

  function getAvailableStatusEffects(slotIndex, effectType) {
    const currentEffects = roundInfo.value.statusEffects[slotIndex]
    const selectedNames = new Set(currentEffects.map(e => e.name))
    return effectType.filter(effect => !selectedNames.has(effect))
  }

  function adjustStatusEffectLevel(slotIndex, effectName, delta) {
    const effects = [...roundInfo.value.statusEffects[slotIndex]]
    const effectIndex = effects.findIndex(e => e.name === effectName)
    if (effectIndex !== -1) {
      const newLevel = Math.max(1, effects[effectIndex].level + delta)
      effects[effectIndex] = { ...effects[effectIndex], level: newLevel }
      updateStatusEffects(slotIndex, effects, true)
    }
  }

  function removeStatusEffect(slotIndex, effectName) {
    const effects = roundInfo.value.statusEffects[slotIndex].filter(e => e.name !== effectName)
    updateStatusEffects(slotIndex, effects, true)
  }

  async function updateCharacterMana(slotIndex, type, newValue, immediate = false) {
    if (!campaignId.value) return
    const parsedValue = parseInt(newValue)
    if (isNaN(parsedValue) || parsedValue < 0) return
    const cls = roundInfo.value.classes[slotIndex]
    const card = characterCards.value.find(c => c.cardType === type && normalizeClassName(c.className) === cls)
    if (!card) return
    const fieldKey = `${card.id}-${type}-mana`
    const oldValue = type === 'SERVANT' ? roundInfo.value.servantMana[slotIndex] : roundInfo.value.masterMana[slotIndex]
    if (type === 'SERVANT') roundInfo.value.servantMana[slotIndex] = parsedValue
    else roundInfo.value.masterMana[slotIndex] = parsedValue
    if (immediate) {
      try {
        await performManaAutoSave(card.id, slotIndex, type, parsedValue, oldValue)
        cancelScheduled(fieldKey)
      } catch (err) { /* handled in perform */ }
    } else {
      scheduleAutoSave(fieldKey, async () => { await performManaAutoSave(card.id, slotIndex, type, parsedValue, oldValue) })
    }
  }

  async function performManaAutoSave(characterCardId, slotIndex, type, newValue, oldValue) {
    const indicatorKey = `${type}-mana-${slotIndex}`
    try {
      saveIndicators.value.set(indicatorKey, 'saving')
      const card = characterCards.value.find(c => c.id === characterCardId)
      if (!card) { saveIndicators.value.set(indicatorKey, 'error'); return }
      const statusData = {
        characterCardId: card.id, campaignId: campaignId.value,
        roundNumber: currentTurn.value, currentMana: newValue,
      }
      if (type === 'MASTER') statusData.currentCommandSeals = roundInfo.value.commandSeals[slotIndex]
      const result = await updateCharacterStatus(statusData)
      characterStatuses.value.set(card.id, result)
      saveIndicators.value.set(indicatorKey, 'saved')
      setTimeout(() => { saveIndicators.value.delete(indicatorKey) }, 3000)
    } catch (err) {
      console.error('魔力自动保存失败:', err)
      saveIndicators.value.set(indicatorKey, 'error')
      if (type === 'SERVANT') roundInfo.value.servantMana[slotIndex] = oldValue
      else roundInfo.value.masterMana[slotIndex] = oldValue
      setTimeout(() => { saveIndicators.value.delete(indicatorKey) }, 3000)
      throw err
    }
  }

  async function updateCommandSeals(slotIndex, newValue, immediate = false) {
    if (!campaignId.value) return
    const parsedValue = parseInt(newValue)
    if (isNaN(parsedValue) || parsedValue < 0 || parsedValue > 3) return
    const cls = roundInfo.value.classes[slotIndex]
    const card = characterCards.value.find(c => c.cardType === 'MASTER' && normalizeClassName(c.className) === cls)
    if (!card) return
    const fieldKey = `${card.id}-command-seals`
    const oldValue = roundInfo.value.commandSeals[slotIndex]
    roundInfo.value.commandSeals[slotIndex] = parsedValue
    if (immediate) {
      try {
        await performCommandSealsAutoSave(card.id, slotIndex, parsedValue, oldValue)
        cancelScheduled(fieldKey)
      } catch (err) { /* handled */ }
    } else {
      scheduleAutoSave(fieldKey, async () => { await performCommandSealsAutoSave(card.id, slotIndex, parsedValue, oldValue) })
    }
  }

  async function performCommandSealsAutoSave(characterCardId, slotIndex, newValue, oldValue) {
    const indicatorKey = `command-seals-${slotIndex}`
    try {
      saveIndicators.value.set(indicatorKey, 'saving')
      const card = characterCards.value.find(c => c.id === characterCardId)
      if (!card) { saveIndicators.value.set(indicatorKey, 'error'); return }
      const statusData = {
        characterCardId: card.id, campaignId: campaignId.value,
        roundNumber: currentTurn.value,
        currentMana: roundInfo.value.masterMana[slotIndex],
        currentCommandSeals: newValue,
      }
      const result = await updateCharacterStatus(statusData)
      characterStatuses.value.set(card.id, result)
      saveIndicators.value.set(indicatorKey, 'saved')
      setTimeout(() => { saveIndicators.value.delete(indicatorKey) }, 3000)
    } catch (err) {
      console.error('令咒自动保存失败:', err)
      saveIndicators.value.set(indicatorKey, 'error')
      roundInfo.value.commandSeals[slotIndex] = oldValue
      setTimeout(() => { saveIndicators.value.delete(indicatorKey) }, 3000)
      throw err
    }
  }

  async function updateStatusEffects(slotIndex, newEffects, immediate = false) {
    if (!campaignId.value) return
    const cls = roundInfo.value.classes[slotIndex]
    const card = characterCards.value.find(c =>
      normalizeClassName(c.className) === cls &&
      (c.cardType === 'SERVANT' || c.cardType === 'MASTER')
    )
    if (!card) return
    const fieldKey = `${card.id}-status-effects`
    const oldEffects = [...roundInfo.value.statusEffects[slotIndex]]
    roundInfo.value.statusEffects[slotIndex] = [...newEffects]
    if (immediate) {
      try {
        await performStatusEffectsAutoSave(card.id, slotIndex, newEffects, oldEffects)
        cancelScheduled(fieldKey)
      } catch (err) { /* handled */ }
    } else {
      scheduleAutoSave(fieldKey, async () => { await performStatusEffectsAutoSave(card.id, slotIndex, newEffects, oldEffects) })
    }
  }

  async function performStatusEffectsAutoSave(characterCardId, slotIndex, newEffects, oldEffects) {
    const indicatorKey = `status-effects-${slotIndex}`
    try {
      saveIndicators.value.set(indicatorKey, 'saving')
      const card = characterCards.value.find(c => c.id === characterCardId)
      if (!card) { saveIndicators.value.set(indicatorKey, 'error'); return }
      const statusData = {
        characterCardId: card.id, campaignId: campaignId.value,
        roundNumber: currentTurn.value,
        statusEffectsList: newEffects,
      }
      const result = await updateCharacterStatus(statusData)
      characterStatuses.value.set(card.id, result)
      saveIndicators.value.set(indicatorKey, 'saved')
      setTimeout(() => { saveIndicators.value.delete(indicatorKey) }, 3000)
    } catch (err) {
      console.error('异常状态自动保存失败:', err)
      saveIndicators.value.set(indicatorKey, 'error')
      roundInfo.value.statusEffects[slotIndex] = oldEffects
      setTimeout(() => { saveIndicators.value.delete(indicatorKey) }, 3000)
      throw err
    }
  }

  return {
    getSelectedStatusEffects, addStatusEffect, getAvailableStatusEffects,
    adjustStatusEffectLevel, removeStatusEffect,
    updateCharacterMana, updateCommandSeals, updateStatusEffects,
    formatStatusEffectDisplay, STATUS_EFFECTS,
    getStatusType, getStatusTypeDisplayName,
  }
}


