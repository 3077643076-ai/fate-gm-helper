export function emptyStats() {
  return { level: 0, strength: 0, endurance: 0, agility: 0, mana: 0, luck: 0, noblePhantasm: 0 }
}

export function createBattleSlots(configs, mode = 'card') {
  return configs.map(slot => ({
    ...slot,
    mode,
    cardId: null,
    card: null,
    name: '',
    stats: emptyStats(),
    showStats: false,
  }))
}

export function isCardUsedInSlots(slots, slotKey, cardId) {
  if (!cardId) return false
  return slots.some(slot => slot.key !== slotKey && Number(slot.cardId) === Number(cardId))
}

export function attachCardsToSlots(slots, cards) {
  for (const slot of slots) {
    slot.card = slot.mode === 'card' && slot.cardId
      ? cards.find(card => Number(card.id) === Number(slot.cardId)) || null
      : null
  }
}

export function getSlotStats(slot, statKey) {
  if (slot.mode === 'card' && slot.card) return Number(slot.card.totalStats?.[statKey]) || 0
  return Number(slot.stats?.[statKey]) || 0
}

export function getSlotDisplayName(slot) {
  if (slot.mode === 'card' && slot.card) return `${slot.card.className || ''} — ${slot.card.code || ''}`.trim()
  return slot.name || ''
}

export function serializeSlots(slots) {
  return slots.map(slot => ({
    position: slot.key,
    cardId: slot.mode === 'card' ? slot.cardId : null,
    mode: slot.mode,
    name: slot.mode === 'manual' ? slot.name : '',
    stats: slot.mode === 'manual' ? { ...slot.stats } : null,
  }))
}

export function restoreSlots(slots, savedItems = [], cards = []) {
  for (const item of savedItems || []) {
    const slot = slots.find(candidate => candidate.key === item.position)
    if (!slot) continue
    slot.mode = item.mode || (item.cardId ? 'card' : 'manual')
    slot.cardId = item.cardId ?? null
    slot.name = item.name || ''
    slot.stats = { ...emptyStats(), ...(item.stats || {}) }
    slot.showStats = false
  }
  attachCardsToSlots(slots, cards)
}
