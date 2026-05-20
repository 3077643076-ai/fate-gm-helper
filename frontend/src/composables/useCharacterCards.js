import { ref, computed } from 'vue'
import { listCharacterCards, retireCharacterCard, unretireCharacterCard } from '../services/characterCard'
import { getCharacterStatusesByCampaignAndRound } from '../services/characterStatus'
import { normalizeClassName, safeNullArray } from '../utils/helpers.js'

export function useCharacterCards(campaignId, roundInfo, currentTurn, servantLeylineIds, masterLeylineIds) {
  const characterCards = ref([])
  const characterStatuses = ref(new Map())
  const servantDeathsCount = ref(0)
  const masterDeathsCount = ref(0)

  const servantCodes = computed(() => {
    return roundInfo.value.classes.map((slotCls) => {
      const card = characterCards.value.find(
        (c) => c.cardType === 'SERVANT' && normalizeClassName(c.className) === slotCls,
      )
      return card?.code || ''
    })
  })

  const masterCodes = computed(() => {
    return roundInfo.value.classes.map((slotCls) => {
      const card = characterCards.value.find(
        (c) => c.cardType === 'MASTER' && normalizeClassName(c.className) === slotCls,
      )
      return card?.code || ''
    })
  })

  const holyGrailScale = computed(() => {
    return servantDeathsCount.value + Math.floor(masterDeathsCount.value / 2)
  })

  const holyGrailTier = computed(() => {
    const s = holyGrailScale.value
    if (s >= 8) return '大圣杯'
    if (s >= 6) return '中圣杯'
    if (s >= 4) return '小圣杯'
    return '极小圣杯'
  })

  function getCardBySlot(slotIndex, type) {
    const cls = roundInfo.value.classes[slotIndex]
    return characterCards.value.find(c => c.cardType === type && normalizeClassName(c.className) === cls)
  }

  function resetRoundInfoToDefaults() {
    roundInfo.value.servantMana = safeNullArray(roundInfo.value.classes.length)
    roundInfo.value.masterMana = safeNullArray(roundInfo.value.classes.length)
    roundInfo.value.commandSeals = new Array(roundInfo.value.classes.length).fill(3)
  }

  function updateRoundInfoFromStatuses() {
    roundInfo.value.servantMana = safeNullArray(roundInfo.value.classes.length)
    roundInfo.value.masterMana = safeNullArray(roundInfo.value.classes.length)
    roundInfo.value.commandSeals = new Array(roundInfo.value.classes.length).fill(3)
    roundInfo.value.statusEffects = roundInfo.value.classes.map(() => [])

    characterCards.value.forEach(card => {
      const status = characterStatuses.value.get(card.id)
      if (!status) return
      const cls = normalizeClassName(card.className)
      const idx = roundInfo.value.classes.indexOf(cls)
      if (idx === -1) return
      if (card.cardType === 'SERVANT' && status.currentMana != null) {
        roundInfo.value.servantMana[idx] = status.currentMana
      } else if (card.cardType === 'MASTER') {
        if (status.currentMana != null) roundInfo.value.masterMana[idx] = status.currentMana
        if (status.currentCommandSeals != null) roundInfo.value.commandSeals[idx] = status.currentCommandSeals
      }
      if (status.statusEffectsList && Array.isArray(status.statusEffectsList)) {
        roundInfo.value.statusEffects[idx] = status.statusEffectsList
      }
    })
  }

  async function loadCharacterCards() {
    if (!campaignId.value) { characterCards.value = []; return }
    try {
      const res = await listCharacterCards(0, 200, null, campaignId.value)
      const list = res?.content || []
      characterCards.value = list.filter(item => item.campaignId === campaignId.value || item.campaignId == null)
    } catch (err) {
      console.error('加载人物卡失败:', err)
      characterCards.value = []
    }
    servantDeathsCount.value = characterCards.value.filter(c => c.cardType === 'SERVANT' && c.retired).length
    masterDeathsCount.value = characterCards.value.filter(c => c.cardType === 'MASTER' && c.retired).length
    await loadCharacterStatuses()
  }

  async function loadCharacterStatuses() {
    if (!campaignId.value) {
      characterStatuses.value = new Map()
      resetRoundInfoToDefaults()
      return
    }
    try {
      const statuses = await getCharacterStatusesByCampaignAndRound(campaignId.value, currentTurn.value)
      const statusMap = new Map()
      statuses.forEach(status => { statusMap.set(status.characterCardId, status) })
      characterStatuses.value = statusMap
      updateRoundInfoFromStatuses()
    } catch (err) {
      console.error('加载角色状态失败:', err)
      characterStatuses.value = new Map()
      resetRoundInfoToDefaults()
    }
  }

  async function retireCharacter(slotIndex, type, loadLeylinesFn) {
    if (!campaignId.value) { alert('请先选择战役'); return }
    const cls = roundInfo.value.classes[slotIndex]
    const card = characterCards.value.find(c => c.cardType === type && normalizeClassName(c.className) === cls)
    if (!card) { alert('未找到对应的角色卡，无法退场。'); return }
    try {
      const { assignLeylineBulk } = await import('../services/leyline.js')
      await assignLeylineBulk(campaignId.value, [{ characterCardId: card.id, leylineId: null }])
    } catch (err) { console.error('取消指派失败:', err) }
    try {
      await retireCharacterCard(card.id)
      card.retired = true
      if (type === 'SERVANT') {
        servantLeylineIds.value[slotIndex] = null
        servantDeathsCount.value++
      } else {
        masterLeylineIds.value[slotIndex] = null
        masterDeathsCount.value++
      }
      if (loadLeylinesFn) await loadLeylinesFn()
      alert('已退场（已标记）')
    } catch (err) { console.error('退场失败:', err); alert('退场失败: ' + (err.message || err)) }
  }

  async function resummonCharacter(slotIndex, type, loadLeylinesFn) {
    if (!campaignId.value) { alert('请先选择战役'); return }
    const cls = roundInfo.value.classes[slotIndex]
    const card = characterCards.value.find(c => c.cardType === type && normalizeClassName(c.className) === cls)
    if (!card) { alert('未找到对应的角色卡，无法返场。'); return }
    try {
      await unretireCharacterCard(card.id)
      card.retired = false
      if (type === 'SERVANT') servantDeathsCount.value = Math.max(0, servantDeathsCount.value - 1)
      else masterDeathsCount.value = Math.max(0, masterDeathsCount.value - 1)
      if (loadLeylinesFn) await loadLeylinesFn()
      alert('已返场')
    } catch (err) { console.error('返场失败:', err); alert('返场失败: ' + (err.message || err)) }
  }

  return {
    characterCards, characterStatuses, servantDeathsCount, masterDeathsCount,
    servantCodes, masterCodes, holyGrailScale, holyGrailTier,
    getCardBySlot, loadCharacterCards, loadCharacterStatuses,
    resetRoundInfoToDefaults, updateRoundInfoFromStatuses,
    retireCharacter, resummonCharacter, normalizeClassName,
  }
}
