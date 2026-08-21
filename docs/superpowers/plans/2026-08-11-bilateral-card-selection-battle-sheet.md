# Bilateral Card Selection Battle Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both blue and yellow battle sides selectable from saved character cards, while keeping manual yellow entry as a fallback.

**Architecture:** Keep `BattleSheetPage.vue` as the route container. Add small pure helpers for side slot state so both sides share card-selection, duplicate-card prevention, stat lookup, save payload, restore, and skill queue behavior. Reuse existing battle sheet JSON fields; do not add backend tables.

**Tech Stack:** Vue 3 Composition API, existing Vite frontend, Node built-in `assert` tests, existing `backend-node` battle sheet API.

## Global Constraints

- Main backend remains `backend-node`; do not add Spring Boot work.
- Do not add a database migration/table for this change.
- Preserve existing save, reload, and confirm-settlement flow.
- Blue and yellow are both player-controlled sides and both must support saved character-card selection.
- Keep yellow manual name/stat entry as fallback for temporary NPCs or unrecorded cards.
- Do not commit automatically because this repository currently contains large user WIP.

---

## File Structure

- Create: `frontend/src/composables/useBattleSideSlots.js`
  - Pure slot helpers for card/manual modes, duplicate-card checks, stat lookup, display names, serialization, and restore.
- Create: `frontend/src/composables/useBattleSideSlots.test.mjs`
  - Node assert tests for yellow card selection, manual fallback, duplicate checks, serialization, and restore.
- Modify: `frontend/src/views/BattleSheetPage.vue`
  - Replace blue-only card logic and yellow-only manual logic with shared side-slot behavior.
  - Keep current phase-board layout and side panels.
- Modify only if needed: `frontend/src/composables/useBattlePhaseBoard.js`
  - No planned changes; only touch if yellow selected-card skills do not enter `buildSkillQueue` correctly.

---

### Task 1: Add Pure Side Slot Helpers

**Files:**
- Create: `frontend/src/composables/useBattleSideSlots.js`
- Create: `frontend/src/composables/useBattleSideSlots.test.mjs`

**Interfaces:**
- Consumes: slot config arrays and character-card objects shaped like existing `servantCards` entries.
- Produces:
  - `createBattleSlots(configs, mode): Slot[]`
  - `isCardUsedInSlots(slots, slotKey, cardId): boolean`
  - `attachCardsToSlots(slots, cards): void`
  - `getSlotStats(slot, statKey): number`
  - `getSlotDisplayName(slot): string`
  - `serializeSlots(slots): Array<{ position, cardId, mode, name, stats }>`
  - `restoreSlots(slots, savedItems, cards): void`

- [ ] **Step 1: Write failing helper tests**

Create `frontend/src/composables/useBattleSideSlots.test.mjs`:

```js
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

console.log('useBattleSideSlots tests passed')
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node frontend/src/composables/useBattleSideSlots.test.mjs
```

Expected: FAIL with module not found for `useBattleSideSlots.js`.

- [ ] **Step 3: Implement helpers**

Create `frontend/src/composables/useBattleSideSlots.js`:

```js
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
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
node frontend/src/composables/useBattleSideSlots.test.mjs
```

Expected: `useBattleSideSlots tests passed`.

---

### Task 2: Wire Yellow Card Selection Into BattleSheetPage

**Files:**
- Modify: `frontend/src/views/BattleSheetPage.vue`

**Interfaces:**
- Consumes Task 1 helpers from `../composables/useBattleSideSlots`.
- Produces yellow slots that can be either `mode: 'card'` or `mode: 'manual'`, with selected-card stats and skills available to existing totals and phase queue.

- [ ] **Step 1: Import side-slot helpers**

Add near existing imports:

```js
import {
  emptyStats,
  createBattleSlots,
  isCardUsedInSlots,
  attachCardsToSlots,
  getSlotStats,
  getSlotDisplayName,
  serializeSlots,
  restoreSlots,
} from '../composables/useBattleSideSlots'
```

Remove the local `emptyStats()` function from `BattleSheetPage.vue` after all references use the imported helper.

- [ ] **Step 2: Initialize both sides with shared slot shape**

Replace blue/yellow slot state with:

```js
const blueSlots = reactive(createBattleSlots(BLUE_SLOTS, 'card'))
const yellowSlots = reactive(createBattleSlots(YELLOW_SLOTS, 'card'))
```

- [ ] **Step 3: Add shared duplicate check**

Replace `isCardUsed` with:

```js
function isCardUsed(sideSlots, slotKey, cardId) {
  return isCardUsedInSlots(sideSlots, slotKey, cardId)
}
```

Update blue template usage from `isCardUsed(pos.key, card.id)` to `isCardUsed(blueSlots, pos.key, card.id)`.

- [ ] **Step 4: Replace yellow template with card/manual controls**

In the yellow formation block, replace each yellow row body with this structure:

```vue
<div v-for="pos in yellowSlots" :key="pos.key" class="position-row">
  <span class="pos-label">{{ pos.label }}</span>
  <select v-model="pos.mode" class="mode-select" @change="onYellowSelectionChanged">
    <option value="card">选择角色卡</option>
    <option value="manual">手动输入</option>
  </select>

  <template v-if="pos.mode === 'card'">
    <select v-model="pos.cardId" @change="onYellowSelectionChanged" class="pos-select">
      <option :value="null">-- 未选择 --</option>
      <option
        v-for="card in servantCards"
        :key="card.id"
        :value="card.id"
        :disabled="isCardUsed(yellowSlots, pos.key, card.id)"
      >
        {{ card.className }} — {{ card.code }}
      </option>
    </select>
    <span v-if="pos.card" class="pos-card-name">{{ getSlotDisplayName(pos) }}</span>
  </template>

  <template v-else>
    <input v-model="pos.name" type="text" class="name-input" placeholder="输入名称" />
    <button type="button" class="btn-edit-stats" @click="toggleStatEditor(pos.key)">
      {{ pos.showStats ? '收起' : '属性' }}
    </button>
    <div v-if="pos.showStats" class="stat-editor">
      <div v-for="stat in statKeys" :key="stat.key" class="stat-cell">
        <label>{{ stat.label }}</label>
        <input type="number" v-model.number="pos.stats[stat.key]" min="0" class="stat-input" />
      </div>
    </div>
  </template>
</div>
```

- [ ] **Step 5: Update selection handlers**

Replace `onBlueSelectionChanged()` with:

```js
function onBlueSelectionChanged() {
  attachCardsToSlots(blueSlots, servantCards.value)
  syncManaFromSelectedCards()
  rebuildSkills()
}
```

Add:

```js
function onYellowSelectionChanged() {
  attachCardsToSlots(yellowSlots, servantCards.value)
  rebuildSkills()
}
```

In any existing load path that assigns `slot.card`, use `attachCardsToSlots` instead of hand-written loops.

- [ ] **Step 6: Update stat lookups**

Replace `getBlueStat` and `getYellowStat` bodies with:

```js
function getBlueStat(slot, statKey) {
  return getSlotStats(slot, statKey)
}

function getYellowStat(slot, statKey) {
  return getSlotStats(slot, statKey)
}
```

- [ ] **Step 7: Make yellow skills enter phase queue**

Ensure `rebuildSkills()` passes both shared slot arrays:

```js
skillQueue.value = buildSkillQueue({
  blueSlots,
  yellowSlots,
  skillTemplateMap: skillTemplateMap.value,
  previousQueue: skillQueue.value,
})
```

Do not filter yellow slots out. `buildSkillQueue` already supports `yellowSlots` when slots have `.card`.

- [ ] **Step 8: Run build**

Run:

```bash
cd frontend && npm run build
```

Expected: build passes.

---

### Task 3: Save, Restore, and Smoke Validate Bilateral Selection

**Files:**
- Modify: `frontend/src/views/BattleSheetPage.vue`
- Modify: `frontend/src/composables/useBattleSideSlots.test.mjs`

**Interfaces:**
- Consumes Task 1 serialization helpers.
- Produces compatible battle sheet payloads:
  - `bluePositions`: JSON array from `serializeSlots(blueSlots)`
  - `yellowPositions`: JSON array from `serializeSlots(yellowSlots)`

- [ ] **Step 1: Add restore test for legacy yellow manual payload**

Append to `useBattleSideSlots.test.mjs`:

```js
const legacyRestored = createBattleSlots(configs, 'card')
restoreSlots(legacyRestored, [{ position: 'MAIN', name: '旧黄方', stats: { strength: 22 } }], cards)
assert.equal(legacyRestored[0].mode, 'manual')
assert.equal(legacyRestored[0].name, '旧黄方')
assert.equal(legacyRestored[0].stats.strength, 22)
```

- [ ] **Step 2: Run helper tests**

Run:

```bash
node frontend/src/composables/useBattleSideSlots.test.mjs
```

Expected: `useBattleSideSlots tests passed`.

- [ ] **Step 3: Update save payload**

In `saveSheet`, replace the current `bluePositions` and `yellowPositions` payloads with:

```js
bluePositions: JSON.stringify(serializeSlots(blueSlots)),
yellowPositions: JSON.stringify(serializeSlots(yellowSlots)),
```

- [ ] **Step 4: Update restore path**

In `applySheetData`, replace manual blue/yellow restore loops with:

```js
restoreSlots(blueSlots, parseJsonObject(sheet.bluePositions, []), servantCards.value)
restoreSlots(yellowSlots, parseJsonObject(sheet.yellowPositions, []), servantCards.value)
syncManaFromSelectedCards()
```

Keep existing compatibility for older yellow payloads through `restoreSlots` legacy fallback.

- [ ] **Step 5: Update settlement selected-blue logic only**

Keep settlement writeback limited to blue side for now:

```js
const selectedBlueSlots = blueSlots.filter(slot => slot.mode === 'card' && slot.card)
```

Do not write yellow mana back in this task unless the user explicitly asks later.

- [ ] **Step 6: Run automated verification**

Run:

```bash
node frontend/src/composables/useBattleSideSlots.test.mjs
node frontend/src/composables/useBattlePhaseBoard.test.mjs
cd frontend && npm run build
```

Expected: all pass.

- [ ] **Step 7: Browser smoke test**

Use a temporary SQLite database via `FATE_GM_DB_PATH` to avoid touching user data. Verify:

1. Create a campaign and four saved servant cards.
2. Open `/battle-sheet/:campaignId`.
3. Select blue main/support from saved cards.
4. Select yellow main/support from saved cards.
5. Confirm yellow total stats update from selected cards.
6. Go to a skill phase and confirm yellow selected-card skills also appear when templates match.
7. Save sheet.
8. Reload page.
9. Confirm both blue and yellow card selections restore.
10. Confirm settlement guard still appears when unresolved phase warnings exist.

Expected: no console errors, save succeeds, reload restores both sides.

---

## Self-Review Notes

- Spec coverage: Both blue and yellow support card selection; yellow manual fallback remains; save/reload supports both sides.
- Placeholder scan: No TBD/TODO placeholders.
- Scope control: This plan does not change backend schema, does not change Spring Boot, and does not add yellow mana writeback.
- Type consistency: slot fields are consistently `mode`, `cardId`, `card`, `name`, `stats`, `showStats`.
