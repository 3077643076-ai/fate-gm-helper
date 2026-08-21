# GM Battle Resolution Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the battle sheet into a GM-facing manual resolution assistant where both sides can be filled from character cards, skills are grouped by rules timing, and only clear numeric effects are calculated automatically.

**Architecture:** Keep `BattleSheetPage.vue` as the route container. Add a pure side-slot helper composable so blue and yellow share card/manual slot behavior, persistence, duplicate prevention, and stat lookup. Keep the existing phase-board engine as the skill-order source; QQ remains outside battle resolution except future resource/statistics linkage.

**Tech Stack:** Vue 3 Composition API, Vite frontend, Node built-in `assert` tests, existing `backend-node` Express + SQLite API.

## Global Constraints

- Main backend remains `backend-node`; do not add Spring Boot work.
- QQ/action submission is not part of the battle resolution flow in this plan.
- QQ may later link through action statistics, mana statistics, or resource writeback only.
- Blue and yellow are both GM-filled battle sides; both must support saved character-card selection.
- Yellow manual name/stat entry remains as a fallback for temporary or unrecorded participants.
- Do not automatically adjudicate complex skills, counters, instant death, stone, resistance, or support logic.
- Only clear numeric effects from skill templates enter automatic calculation.
- Store new battle state in existing battle sheet JSON fields; do not add database tables.
- Preserve current save, reload, phase warning, and confirm-settlement flow.
- Do not commit automatically because this repository currently contains large user WIP.

---

## File Structure

- Create: `frontend/src/composables/useBattleSideSlots.js`
  - Pure helpers for shared blue/yellow slot creation, duplicate card checks, selected-card attach, stat lookup, display names, serialization, and restore.
- Create: `frontend/src/composables/useBattleSideSlots.test.mjs`
  - Node assert tests for card slots, manual fallback, duplicate prevention, serialization, restore, and legacy yellow manual payloads.
- Modify: `frontend/src/views/BattleSheetPage.vue`
  - Use shared slot helpers for both sides.
  - Render yellow with card/manual mode controls.
  - Feed both sides into totals, skill queue, save, restore, and smoke validation.
- Modify only if needed: `frontend/src/composables/useBattlePhaseBoard.js`
  - Do not change unless yellow selected-card skills fail to enter queue with existing `buildSkillQueue`.

---

### Task 1: Add Shared Side Slot Helper

**Files:**
- Create: `frontend/src/composables/useBattleSideSlots.js`
- Create: `frontend/src/composables/useBattleSideSlots.test.mjs`

**Interfaces:**
- Consumes: slot configs like `{ key: 'MAIN', label: '主力位', isMain: true }[]` and card objects with `id`, `code`, `className`, `totalStats`.
- Produces:
  - `emptyStats(): Stats`
  - `createBattleSlots(configs, mode = 'card'): Slot[]`
  - `isCardUsedInSlots(slots, slotKey, cardId): boolean`
  - `attachCardsToSlots(slots, cards): void`
  - `getSlotStats(slot, statKey): number`
  - `getSlotDisplayName(slot): string`
  - `serializeSlots(slots): SavedSlot[]`
  - `restoreSlots(slots, savedItems, cards): void`

- [ ] **Step 1: Write failing tests**

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

const legacyRestored = createBattleSlots(configs, 'card')
restoreSlots(legacyRestored, [{ position: 'MAIN', name: '旧黄方', stats: { strength: 22 } }], cards)
assert.equal(legacyRestored[0].mode, 'manual')
assert.equal(legacyRestored[0].name, '旧黄方')
assert.equal(legacyRestored[0].stats.strength, 22)

console.log('useBattleSideSlots tests passed')
```

- [ ] **Step 2: Run tests to confirm failure**

Run:

```bash
node frontend/src/composables/useBattleSideSlots.test.mjs
```

Expected: FAIL with module not found for `useBattleSideSlots.js`.

- [ ] **Step 3: Implement helper**

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

- [ ] **Step 4: Verify helper tests pass**

Run:

```bash
node frontend/src/composables/useBattleSideSlots.test.mjs
```

Expected: `useBattleSideSlots tests passed`.

---

### Task 2: Wire Both Sides to Card/Manual Slots

**Files:**
- Modify: `frontend/src/views/BattleSheetPage.vue`

**Interfaces:**
- Consumes Task 1 helper exports.
- Produces: blue and yellow slots with identical shape: `mode`, `cardId`, `card`, `name`, `stats`, `showStats`.

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

Remove the local `emptyStats()` function from `BattleSheetPage.vue`.

- [ ] **Step 2: Replace slot initialization**

Replace current slot state with:

```js
const blueSlots = reactive(createBattleSlots(BLUE_SLOTS, 'card'))
const yellowSlots = reactive(createBattleSlots(YELLOW_SLOTS, 'card'))
```

- [ ] **Step 3: Replace duplicate-card check**

Replace current `isCardUsed` with:

```js
function isCardUsed(sideSlots, slotKey, cardId) {
  return isCardUsedInSlots(sideSlots, slotKey, cardId)
}
```

Update blue template usage to:

```vue
:disabled="isCardUsed(blueSlots, pos.key, card.id)"
```

- [ ] **Step 4: Replace yellow formation row UI**

In the yellow formation block, replace each row body with:

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

- [ ] **Step 5: Add selection handlers**

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

- [ ] **Step 6: Replace stat lookup functions**

Replace function bodies:

```js
function getBlueStat(slot, statKey) {
  return getSlotStats(slot, statKey)
}

function getYellowStat(slot, statKey) {
  return getSlotStats(slot, statKey)
}
```

- [ ] **Step 7: Verify yellow selected-card skills enter queue**

Ensure `rebuildSkills()` still calls:

```js
skillQueue.value = buildSkillQueue({
  blueSlots,
  yellowSlots,
  skillTemplateMap: skillTemplateMap.value,
  previousQueue: skillQueue.value,
})
```

Do not filter out yellow slots. `buildSkillQueue` already accepts yellow slots with `.card`.

- [ ] **Step 8: Build frontend**

Run:

```bash
cd frontend && npm run build
```

Expected: build passes.

---

### Task 3: Persist, Restore, and Validate GM Battle Flow

**Files:**
- Modify: `frontend/src/views/BattleSheetPage.vue`

**Interfaces:**
- Consumes Task 1 `serializeSlots` and `restoreSlots`.
- Produces compatible battle sheet JSON payloads:
  - `bluePositions = JSON.stringify(serializeSlots(blueSlots))`
  - `yellowPositions = JSON.stringify(serializeSlots(yellowSlots))`

- [ ] **Step 1: Update save payload**

In `saveSheet`, replace current position payload lines with:

```js
bluePositions: JSON.stringify(serializeSlots(blueSlots)),
yellowPositions: JSON.stringify(serializeSlots(yellowSlots)),
```

- [ ] **Step 2: Update restore path**

In `applySheetData`, replace manual blue/yellow restore loops with:

```js
restoreSlots(blueSlots, parseJsonObject(sheet.bluePositions, []), servantCards.value)
restoreSlots(yellowSlots, parseJsonObject(sheet.yellowPositions, []), servantCards.value)
syncManaFromSelectedCards()
```

Then call `rebuildSkills()` after restore so both selected sides enter the phase queue.

- [ ] **Step 3: Keep settlement writeback scoped to blue for now**

In `confirmSettlement`, use:

```js
const selectedBlueSlots = blueSlots.filter(slot => slot.mode === 'card' && slot.card)
```

Do not add yellow mana writeback in this task; that is a later resource-linkage decision.

- [ ] **Step 4: Run automated verification**

Run:

```bash
node frontend/src/composables/useBattleSideSlots.test.mjs
node frontend/src/composables/useBattlePhaseBoard.test.mjs
cd frontend && npm run build
```

Expected: all pass.

- [ ] **Step 5: Browser smoke test with temporary database**

Use `FATE_GM_DB_PATH=.superpowers/sdd/gm-battle-resolution-smoke.db` to avoid touching real data.

Smoke checklist:

1. Create a test campaign and at least four servant cards.
2. Open `/battle-sheet/:campaignId`.
3. Select blue main/support from saved cards.
4. Select yellow main/support from saved cards.
5. Confirm yellow total stats update from selected cards.
6. Confirm yellow selected-card skills appear in the correct phase when templates match.
7. Switch one yellow slot to manual mode and confirm manual stats still affect totals.
8. Save sheet.
9. Reload page.
10. Confirm both blue and yellow card/manual selections restore.
11. Confirm unresolved phase warning guard still appears before settlement.

Expected: no console errors, save succeeds, reload restores both sides.

---

## Self-Review Notes

- Spec coverage: Both sides support saved cards; yellow manual fallback remains; skills/宝具 are grouped by phase for GM manual control; QQ does not drive combat.
- Placeholder scan: No TBD/TODO placeholders.
- Scope control: No backend schema changes, no Spring Boot changes, no automatic complex skill adjudication, no yellow mana writeback in this plan.
- Type consistency: Slot fields are consistently `mode`, `cardId`, `card`, `name`, `stats`, `showStats`.
