import assert from 'node:assert/strict'
import {
  createBattleSlots,
  isCardUsedInSlots,
  attachCardsToSlots,
  getSlotStats,
  getSlotDisplayName,
  serializeSlots,
  restoreSlots,
} from './useBattleSideSlots.js'

const configs = [
  { key: 'MAIN', label: '主力位', isMain: true },
  { key: 'SUPPORT_1', label: '辅助位1', isMain: false },
]

const cards = [
  {
    id: 1,
    code: '阿尔托莉雅',
    className: 'Saber',
    totalStats: { level: 0, strength: 50, endurance: 40, agility: 40, mana: 40, luck: 30, noblePhantasm: 50 },
  },
  {
    id: 2,
    code: '库丘林',
    className: 'Lancer',
    totalStats: { level: 0, strength: 40, endurance: 35, agility: 35, mana: 30, luck: 20, noblePhantasm: 40 },
  },
]

const slots = createBattleSlots(configs, 'card')
assert.equal(slots[0].mode, 'card')
assert.equal(slots[0].cardId, null)
assert.deepEqual(slots[0].stats, { level: 0, strength: 0, endurance: 0, agility: 0, mana: 0, luck: 0, noblePhantasm: 0 })

slots[0].cardId = 1
attachCardsToSlots(slots, cards)
assert.equal(slots[0].card.className, 'Saber')
assert.equal(getSlotStats(slots[0], 'strength'), 50)
assert.equal(getSlotDisplayName(slots[0]), 'Saber — 阿尔托莉雅')
assert.equal(isCardUsedInSlots(slots, 'SUPPORT_1', 1), true)
assert.equal(isCardUsedInSlots(slots, 'MAIN', 1), false)

slots[1].mode = 'manual'
slots[1].name = 'Rider 美杜莎'
slots[1].stats.strength = 30
assert.equal(getSlotStats(slots[1], 'strength'), 30)
assert.equal(getSlotDisplayName(slots[1]), 'Rider 美杜莎')

const saved = serializeSlots(slots)
assert.deepEqual(saved[0], { position: 'MAIN', cardId: 1, mode: 'card', name: '', stats: null })
assert.equal(saved[1].mode, 'manual')
assert.equal(saved[1].stats.strength, 30)

const restored = createBattleSlots(configs, 'card')
restoreSlots(restored, saved, cards)
assert.equal(restored[0].card.className, 'Saber')
assert.equal(restored[1].mode, 'manual')
assert.equal(restored[1].name, 'Rider 美杜莎')
assert.equal(restored[1].stats.strength, 30)

const legacyRestored = createBattleSlots(configs, 'card')
restoreSlots(legacyRestored, [{ position: 'MAIN', name: '旧黄方', stats: { strength: 22 } }], cards)
assert.equal(legacyRestored[0].mode, 'manual')
assert.equal(legacyRestored[0].name, '旧黄方')
assert.equal(legacyRestored[0].stats.strength, 22)

console.log('useBattleSideSlots tests passed')
