# Phase Board Battle Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a usable phase-board battle sheet that lets the GM resolve combat by phase, confirm skill effects, preview impact, and save the final result.

**Architecture:** Keep `BattleSheetPage.vue` as the route container, but move phase/skill queue logic into a pure composable so it can be tested without a browser. Store first-version phase state, skill queue, and manual corrections inside the existing battle sheet JSON fields to avoid a database migration. Split UI into small battle components only where the existing page would otherwise become harder to maintain.

**Tech Stack:** Vue 3 Composition API, Vite/rolldown-vite, Vue Router, Node.js built-in `assert` tests for pure composables, existing `backend-node` Express + SQLite battle sheet API.

## Global Constraints

- Main backend remains `backend-node`; do not add Spring Boot work.
- Do not attempt full automatic GM adjudication; only clear numeric effects are calculated automatically.
- Preserve skill raw text for GM review.
- Constant/passive skills default on, but GM can disable them.
- Non-passive skills default pending; GM confirms whether they apply.
- GM can override effective rank for downgraded, sealed, or invalidated skills.
- Keep current save/confirm settlement flow working.
- Do not create a new database table in the first version; store new state in existing JSON payloads.
- Do not commit automatically because this repository currently contains large user WIP.

---

## File Structure

- Create: `frontend/src/composables/useBattlePhaseBoard.js`
  - Pure helpers for phases, skill queue creation, status changes, rank value lookup, effect application, phase summaries, and warnings.
- Create: `frontend/src/composables/useBattlePhaseBoard.test.mjs`
  - Node assert tests for passive defaults, pending defaults, rank override, selected-stat conversion, and summary aggregation.
- Create: `frontend/src/components/battle/PhaseNav.vue`
  - Left-side phase navigation with status badges.
- Create: `frontend/src/components/battle/SkillQueuePanel.vue`
  - Current phase skill queue rows and GM controls.
- Create: `frontend/src/components/battle/SkillImpactPreview.vue`
  - Right-side selected skill raw text, structured effects, GM note, and before/after preview.
- Create: `frontend/src/components/battle/BattleSummaryPanel.vue`
  - Sticky summary of attributes, win-rate chain, mana, and unresolved warnings.
- Modify: `frontend/src/views/BattleSheetPage.vue`
  - Route-level orchestration, persistence mapping, existing formation/stat/mana/win-rate integration, component wiring.
- Modify: `frontend/src/composables/useBattleCalculator.js`
  - Minimal extension only if phase-level `blueInitial`, `blueMain`, `blueFinalPhase`, and guarantee modifiers need named inputs.
- Modify: `frontend/src/views/SkillTemplateManage.vue`
  - Add helper text/examples for phase-board effect kinds if needed; do not rebuild the page.
- Modify: `backend-node/routes/battleSheets.js`
  - Only if the existing JSON payload size/field passthrough blocks saving new phase state; otherwise leave unchanged.

---

### Task 1: Add Pure Phase Board Engine

**Files:**
- Create: `frontend/src/composables/useBattlePhaseBoard.js`
- Create: `frontend/src/composables/useBattlePhaseBoard.test.mjs`

**Interfaces:**
- Consumes: character card skills, skill templates, selected blue/yellow slots, existing saved phase state.
- Produces:
  - `PHASES: Array<{ key: string, label: string }>`
  - `STATUS: { AUTO_ON, PENDING, APPLIED, DISABLED, MANUAL }`
  - `buildSkillQueue({ blueSlots, yellowSlots, skillTemplateMap, previousQueue }): SkillQueueItem[]`
  - `applyQueueEffects({ queue, phaseKey }): PhaseEffectSummary`
  - `getPhaseWarnings({ queue, phaseState }): string[]`

- [ ] **Step 1: Write failing tests for queue defaults**

Create `frontend/src/composables/useBattlePhaseBoard.test.mjs` with:

```js
import assert from 'node:assert/strict'
import {
  STATUS,
  buildSkillQueue,
  applyQueueEffects,
  getPhaseWarnings,
} from './useBattlePhaseBoard.js'

const statModifiers = JSON.stringify({ strength: 10 })
const skillTemplateMap = new Map([
  ['勇猛', { name: '勇猛', timing: '常驻', effects: [{ kind: 'win_rate_modifier', value: 30 }] }],
  ['魔力放出', { name: '魔力放出', timing: '主要工序', effects: [{ kind: 'select_stat_modifier', value: 10 }, { kind: 'win_rate_modifier', value: 5 }] }],
  ['旧模板', { name: '旧模板', timing: '战斗开始时', statModifiers, winRateModifier: 5 }],
])

const blueSlots = [
  {
    key: 'MAIN',
    label: '主力位',
    isMain: true,
    card: {
      id: 1,
      className: 'Saber',
      code: '阿尔托莉雅',
      classSkills: [],
      personalSkills: [{ name: '勇猛', rank: 'C' }, { name: '魔力放出', rank: 'B' }],
      noblePhantasms: [],
    },
  },
]

const yellowSlots = []

const queue = buildSkillQueue({ blueSlots, yellowSlots, skillTemplateMap, previousQueue: [] })
assert.equal(queue.find(item => item.skillName === '勇猛').status, STATUS.AUTO_ON)
assert.equal(queue.find(item => item.skillName === '魔力放出').status, STATUS.PENDING)

const selected = queue.map(item => item.skillName === '魔力放出'
  ? { ...item, status: STATUS.APPLIED, selectedStat: 'strength' }
  : item)
const summary = applyQueueEffects({ queue: selected, phaseKey: 'MAIN' })
assert.equal(summary.blueStats.strength, 10)
assert.equal(summary.blueWinRate, 5)
assert.deepEqual(getPhaseWarnings({ queue: selected, phaseState: { phases: { MAIN: { confirmed: false } } } }), ['主要工序尚未确认'])

console.log('useBattlePhaseBoard tests passed')
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node frontend/src/composables/useBattlePhaseBoard.test.mjs
```

Expected: FAIL with module not found for `useBattlePhaseBoard.js`.

- [ ] **Step 3: Implement phase constants and queue builder**

Create `frontend/src/composables/useBattlePhaseBoard.js` with these exported constants and core helpers:

```js
export const PHASES = [
  { key: 'FORMATION', label: '编队' },
  { key: 'PASSIVE', label: '常驻检查' },
  { key: 'BATTLE_START', label: '战斗开始时' },
  { key: 'INITIAL', label: '初始工序' },
  { key: 'MAIN', label: '主要工序' },
  { key: 'FINAL', label: '最终工序' },
  { key: 'RESULT', label: '决胜结算' },
]

export const STATUS = {
  AUTO_ON: 'AUTO_ON',
  PENDING: 'PENDING',
  APPLIED: 'APPLIED',
  DISABLED: 'DISABLED',
  MANUAL: 'MANUAL',
}

const TIMING_TO_PHASE = {
  常驻: 'PASSIVE',
  随时: 'MAIN',
  战斗开始时: 'BATTLE_START',
  初始工序: 'INITIAL',
  主要工序: 'MAIN',
  最终工序: 'FINAL',
}

export function createDefaultPhaseState(previous = {}) {
  const phases = {}
  for (const phase of PHASES) {
    phases[phase.key] = { confirmed: Boolean(previous.phases?.[phase.key]?.confirmed) }
  }
  return { currentPhase: previous.currentPhase || 'FORMATION', phases }
}

export function normalizeSkillName(name) {
  return String(name || '').replace(/\s+/g, '').toLowerCase()
}

function parseJson(value, fallback) {
  if (!value) return fallback
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { return fallback }
}

function getTemplateEffects(template) {
  if (!template) return []
  if (Array.isArray(template.effects)) return template.effects
  const parsed = parseJson(template.effectsJson, [])
  return Array.isArray(parsed) ? parsed : []
}

function getPhaseForTemplate(template) {
  return TIMING_TO_PHASE[template?.timing] || 'MAIN'
}
```

Then implement `buildSkillQueue` with this behavior:

```js
export function buildSkillQueue({ blueSlots = [], yellowSlots = [], skillTemplateMap = new Map(), previousQueue = [] } = {}) {
  const previousById = new Map(previousQueue.map(item => [item.id, item]))
  const items = []

  const addSide = (side, slots) => {
    for (const slot of slots) {
      const card = slot.card
      if (!card) continue
      const characterName = `${card.className || ''} ${card.code || ''}`.trim()
      const lists = [card.classSkills || [], card.personalSkills || [], card.noblePhantasms || []]
      for (const list of lists) {
        for (const skill of list) {
          const skillName = skill.name || ''
          if (!skillName) continue
          const template = skillTemplateMap.get(normalizeSkillName(skillName)) || null
          const phase = getPhaseForTemplate(template)
          const id = `${side}:${slot.key}:${skillName}`
          const previous = previousById.get(id)
          const defaultStatus = phase === 'PASSIVE' ? STATUS.AUTO_ON : STATUS.PENDING
          items.push({
            id,
            side,
            position: slot.key,
            positionLabel: slot.label || slot.key,
            characterId: card.id || null,
            characterName,
            skillName,
            originalRank: skill.rank || '',
            effectiveRank: previous?.effectiveRank || skill.rank || '',
            phase,
            status: previous?.status || defaultStatus,
            selectedStat: previous?.selectedStat || '',
            target: previous?.target || 'self',
            manualJudgment: Boolean(previous?.manualJudgment || template?.manualJudgment),
            gmNote: previous?.gmNote || '',
            template,
          })
        }
      }
    }
  }

  addSide('blue', blueSlots)
  addSide('yellow', yellowSlots)
  return items
}
```

- [ ] **Step 4: Implement effect aggregation and warnings**

Add:

```js
function emptyStats() {
  return { level: 0, strength: 0, endurance: 0, agility: 0, mana: 0, luck: 0, noblePhantasm: 0 }
}

export function applyQueueEffects({ queue = [], phaseKey = null } = {}) {
  const summary = {
    blueStats: emptyStats(),
    yellowStats: emptyStats(),
    blueWinRate: 0,
    yellowWinRate: 0,
    blueGuarantee: 0,
    yellowGuarantee: 0,
    blueManaCost: 0,
    yellowManaCost: 0,
    applied: [],
    manual: [],
  }

  const activeStatuses = new Set([STATUS.AUTO_ON, STATUS.APPLIED])
  for (const item of queue) {
    if (phaseKey && item.phase !== phaseKey) continue
    if (!activeStatuses.has(item.status)) continue
    if (item.manualJudgment || item.status === STATUS.MANUAL) {
      summary.manual.push(`${item.skillName}：需 GM 裁决`)
      continue
    }

    const effects = getTemplateEffects(item.template)
    if (!effects.length) {
      const modifiers = parseJson(item.template?.statModifiers, {})
      for (const [stat, value] of Object.entries(modifiers)) {
        const target = item.side === 'blue' ? summary.blueStats : summary.yellowStats
        target[stat] = (target[stat] || 0) + (Number(value) || 0)
      }
      if (item.side === 'blue') summary.blueWinRate += Number(item.template?.winRateModifier) || 0
      else summary.yellowWinRate += Number(item.template?.winRateModifier) || 0
      summary.applied.push(`${item.skillName}：旧模板效果已套用`)
      continue
    }

    for (const effect of effects) {
      const sidePrefix = item.side === 'blue' ? 'blue' : 'yellow'
      if (effect.kind === 'stat_modifier' && effect.stat) {
        const target = sidePrefix === 'blue' ? summary.blueStats : summary.yellowStats
        target[effect.stat] = (target[effect.stat] || 0) + (Number(effect.value) || 0)
        summary.applied.push(`${item.skillName}：${effect.stat} ${Number(effect.value) || 0}`)
      } else if (effect.kind === 'select_stat_modifier' && item.selectedStat) {
        const target = sidePrefix === 'blue' ? summary.blueStats : summary.yellowStats
        target[item.selectedStat] = (target[item.selectedStat] || 0) + (Number(effect.value) || 0)
        summary.applied.push(`${item.skillName}：${item.selectedStat} ${Number(effect.value) || 0}`)
      } else if (effect.kind === 'win_rate_modifier') {
        if (sidePrefix === 'blue') summary.blueWinRate += Number(effect.value) || 0
        else summary.yellowWinRate += Number(effect.value) || 0
        summary.applied.push(`${item.skillName}：胜率 ${Number(effect.value) || 0}`)
      } else if (effect.kind === 'enemy_win_rate_modifier') {
        if (sidePrefix === 'blue') summary.yellowWinRate += Number(effect.value) || 0
        else summary.blueWinRate += Number(effect.value) || 0
        summary.applied.push(`${item.skillName}：敌方胜率 ${Number(effect.value) || 0}`)
      } else if (effect.kind === 'guarantee_modifier') {
        if (sidePrefix === 'blue') summary.blueGuarantee += Number(effect.value) || 0
        else summary.yellowGuarantee += Number(effect.value) || 0
        summary.applied.push(`${item.skillName}：保底 ${Number(effect.value) || 0}`)
      } else if (effect.kind === 'mana_cost') {
        if (sidePrefix === 'blue') summary.blueManaCost += Number(effect.value) || 0
        else summary.yellowManaCost += Number(effect.value) || 0
      } else {
        summary.manual.push(`${item.skillName}：${effect.text || effect.label || '需 GM 裁决'}`)
      }
    }
  }

  return summary
}

const PHASE_LABELS = Object.fromEntries(PHASES.map(phase => [phase.key, phase.label]))

export function getPhaseWarnings({ queue = [], phaseState = createDefaultPhaseState() } = {}) {
  const warnings = []
  for (const item of queue) {
    if (item.status === STATUS.PENDING) warnings.push(`${PHASE_LABELS[item.phase] || item.phase}：${item.skillName} 待确认`)
    if (item.status === STATUS.MANUAL || item.manualJudgment) warnings.push(`${PHASE_LABELS[item.phase] || item.phase}：${item.skillName} 需 GM 裁决`)
  }
  for (const phase of PHASES) {
    if (['FORMATION', 'RESULT'].includes(phase.key)) continue
    if (!phaseState.phases?.[phase.key]?.confirmed) warnings.push(`${phase.label}尚未确认`)
  }
  return [...new Set(warnings)]
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
node frontend/src/composables/useBattlePhaseBoard.test.mjs
```

Expected: `useBattlePhaseBoard tests passed`.

---

### Task 2: Build Phase Navigation and Skill Queue Components

**Files:**
- Create: `frontend/src/components/battle/PhaseNav.vue`
- Create: `frontend/src/components/battle/SkillQueuePanel.vue`

**Interfaces:**
- Consumes from route page:
  - `phases`
  - `phaseState`
  - `currentPhase`
  - `queueForCurrentPhase`
  - event handlers: `setCurrentPhase`, `updateSkillQueueItem`, `confirmCurrentPhase`, `selectSkillQueueItem`
- Produces UI events only; no direct API calls.

- [ ] **Step 1: Create `PhaseNav.vue`**

Use this component content:

```vue
<script setup>
defineProps({
  phases: { type: Array, required: true },
  currentPhase: { type: String, required: true },
  phaseState: { type: Object, required: true },
  warningsByPhase: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['select'])
</script>

<template>
  <aside class="phase-nav">
    <button
      v-for="phase in phases"
      :key="phase.key"
      type="button"
      class="phase-nav-item"
      :class="{ active: currentPhase === phase.key, confirmed: phaseState.phases?.[phase.key]?.confirmed }"
      @click="emit('select', phase.key)"
    >
      <span>{{ phase.label }}</span>
      <small v-if="warningsByPhase[phase.key]">{{ warningsByPhase[phase.key] }} 项待处理</small>
      <small v-else-if="phaseState.phases?.[phase.key]?.confirmed">已确认</small>
      <small v-else>未确认</small>
    </button>
  </aside>
</template>
```

- [ ] **Step 2: Create `SkillQueuePanel.vue`**

Use this component content:

```vue
<script setup>
import { STATUS } from '../../composables/useBattlePhaseBoard'

const props = defineProps({
  phaseLabel: { type: String, required: true },
  queue: { type: Array, required: true },
  selectedSkillId: { type: String, default: '' },
})

const emit = defineEmits(['select-skill', 'update-skill', 'confirm-phase'])

const rankOptions = ['EX', 'A', 'B', 'C', 'D', 'E', '无效']
const statOptions = [
  { key: '', label: '不选择' },
  { key: 'strength', label: '筋力' },
  { key: 'endurance', label: '耐久' },
  { key: 'agility', label: '敏捷' },
  { key: 'mana', label: '魔力' },
  { key: 'luck', label: '幸运' },
  { key: 'noblePhantasm', label: '宝具' },
]

function patch(item, patchValue) {
  emit('update-skill', { ...item, ...patchValue })
}
</script>

<template>
  <section class="skill-queue-panel">
    <header class="queue-header">
      <div>
        <h2>{{ phaseLabel }}</h2>
        <p>确认本工序技能是否生效，必要时调整生效等级。</p>
      </div>
      <button type="button" class="btn-confirm-phase" @click="emit('confirm-phase')">确认本工序</button>
    </header>

    <div v-if="queue.length === 0" class="empty-queue">本工序没有待结算技能。</div>

    <article
      v-for="item in queue"
      :key="item.id"
      class="skill-queue-row"
      :class="{ selected: selectedSkillId === item.id, applied: item.status === STATUS.APPLIED || item.status === STATUS.AUTO_ON, disabled: item.status === STATUS.DISABLED }"
      @click="emit('select-skill', item.id)"
    >
      <div class="skill-row-main">
        <strong>{{ item.skillName }}</strong>
        <span>{{ item.characterName }} · {{ item.positionLabel }}</span>
        <small>原等级 {{ item.originalRank || '未填' }}</small>
      </div>

      <label>
        生效等级
        <select :value="item.effectiveRank" @change="patch(item, { effectiveRank: $event.target.value })">
          <option v-for="rank in rankOptions" :key="rank" :value="rank">{{ rank }}</option>
        </select>
      </label>

      <label>
        选择属性
        <select :value="item.selectedStat" @change="patch(item, { selectedStat: $event.target.value })">
          <option v-for="stat in statOptions" :key="stat.key" :value="stat.key">{{ stat.label }}</option>
        </select>
      </label>

      <div class="status-buttons">
        <button type="button" @click.stop="patch(item, { status: item.phase === 'PASSIVE' ? STATUS.AUTO_ON : STATUS.APPLIED })">生效</button>
        <button type="button" @click.stop="patch(item, { status: STATUS.DISABLED })">关闭</button>
        <button type="button" @click.stop="patch(item, { status: STATUS.MANUAL, manualJudgment: true })">需裁决</button>
      </div>

      <textarea
        :value="item.gmNote"
        placeholder="GM 备注，例如：被对魔力降级为 C / 本场封印"
        @input="patch(item, { gmNote: $event.target.value })"
      />
    </article>
  </section>
</template>
```

- [ ] **Step 3: Import both components into `BattleSheetPage.vue` without rendering them yet**

Add imports near existing imports:

```js
import PhaseNav from '../components/battle/PhaseNav.vue'
import SkillQueuePanel from '../components/battle/SkillQueuePanel.vue'
```

Run:

```bash
cd frontend && npm run build
```

Expected: build passes.

---

### Task 3: Wire Phase State Into BattleSheetPage

**Files:**
- Modify: `frontend/src/views/BattleSheetPage.vue`

**Interfaces:**
- Consumes Task 1 helpers and Task 2 components.
- Produces persisted `phaseState`, `skillQueue`, and `manualCorrectionsByPhase` inside existing JSON save payload.

- [ ] **Step 1: Import phase board helpers**

Add:

```js
import {
  PHASES,
  STATUS,
  createDefaultPhaseState,
  buildSkillQueue,
  applyQueueEffects,
  getPhaseWarnings,
  normalizeSkillName,
} from '../composables/useBattlePhaseBoard'
```

If `BattleSheetPage.vue` already has a local `normalizeSkillName`, remove the local function and use the imported one.

- [ ] **Step 2: Add phase state refs**

Near existing skill state:

```js
const phaseState = reactive(createDefaultPhaseState())
const skillQueue = ref([])
const selectedSkillId = ref('')
const manualCorrectionsByPhase = reactive({
  BATTLE_START: { blue: { stat: {}, winRate: 0, guarantee: 0, note: '' }, yellow: { stat: {}, winRate: 0, guarantee: 0, note: '' } },
  INITIAL: { blue: { stat: {}, winRate: 0, guarantee: 0, note: '' }, yellow: { stat: {}, winRate: 0, guarantee: 0, note: '' } },
  MAIN: { blue: { stat: {}, winRate: 0, guarantee: 0, note: '' }, yellow: { stat: {}, winRate: 0, guarantee: 0, note: '' } },
  FINAL: { blue: { stat: {}, winRate: 0, guarantee: 0, note: '' }, yellow: { stat: {}, winRate: 0, guarantee: 0, note: '' } },
})
```

- [ ] **Step 3: Add computed phase views**

Add:

```js
const currentPhase = computed(() => phaseState.currentPhase || 'FORMATION')
const currentPhaseMeta = computed(() => PHASES.find(phase => phase.key === currentPhase.value) || PHASES[0])
const queueForCurrentPhase = computed(() => skillQueue.value.filter(item => item.phase === currentPhase.value))
const selectedSkill = computed(() => skillQueue.value.find(item => item.id === selectedSkillId.value) || queueForCurrentPhase.value[0] || null)
const allQueueEffects = computed(() => applyQueueEffects({ queue: skillQueue.value }))
const currentPhaseEffects = computed(() => applyQueueEffects({ queue: skillQueue.value, phaseKey: currentPhase.value }))
const phaseWarnings = computed(() => getPhaseWarnings({ queue: skillQueue.value, phaseState }))
const warningsByPhase = computed(() => {
  const counts = {}
  for (const warning of phaseWarnings.value) {
    for (const phase of PHASES) {
      if (warning.startsWith(phase.label)) counts[phase.key] = (counts[phase.key] || 0) + 1
    }
  }
  return counts
})
```

- [ ] **Step 4: Replace `activeTemplateEffects` source with queue summary**

Keep the existing `activeTemplateEffects` API shape so current win-rate code keeps working, but point it to `allQueueEffects`:

```js
const activeTemplateEffects = computed(() => ({
  blueStats: allQueueEffects.value.blueStats,
  blueWinRate: allQueueEffects.value.blueWinRate,
  yellowWinRate: allQueueEffects.value.yellowWinRate,
  applied: allQueueEffects.value.applied,
  manual: allQueueEffects.value.manual,
}))
```

- [ ] **Step 5: Rebuild skill queue when formation or templates change**

Modify `rebuildSkills()` to still populate the old `availableSkills` for backward compatibility, then add:

```js
skillQueue.value = buildSkillQueue({
  blueSlots,
  yellowSlots,
  skillTemplateMap: skillTemplateMap.value,
  previousQueue: skillQueue.value,
})
if (!selectedSkillId.value && skillQueue.value.length) selectedSkillId.value = skillQueue.value[0].id
```

- [ ] **Step 6: Add update handlers**

Add:

```js
function setCurrentPhase(phaseKey) {
  phaseState.currentPhase = phaseKey
  const first = skillQueue.value.find(item => item.phase === phaseKey)
  if (first) selectedSkillId.value = first.id
}

function updateSkillQueueItem(nextItem) {
  skillQueue.value = skillQueue.value.map(item => item.id === nextItem.id ? nextItem : item)
  selectedSkillId.value = nextItem.id
}

function selectSkillQueueItem(skillId) {
  selectedSkillId.value = skillId
}

function confirmCurrentPhase() {
  if (!phaseState.phases[currentPhase.value]) phaseState.phases[currentPhase.value] = { confirmed: false }
  phaseState.phases[currentPhase.value].confirmed = true
}
```

- [ ] **Step 7: Persist phase state**

In `saveSheet`, inside `groupAStats`, add:

```js
phaseState: JSON.parse(JSON.stringify(phaseState)),
skillQueue: skillQueue.value.map(item => ({
  id: item.id,
  side: item.side,
  position: item.position,
  characterId: item.characterId,
  characterName: item.characterName,
  skillName: item.skillName,
  originalRank: item.originalRank,
  effectiveRank: item.effectiveRank,
  phase: item.phase,
  status: item.status,
  selectedStat: item.selectedStat,
  target: item.target,
  manualJudgment: item.manualJudgment,
  gmNote: item.gmNote,
})),
manualCorrectionsByPhase: JSON.parse(JSON.stringify(manualCorrectionsByPhase)),
```

- [ ] **Step 8: Restore phase state**

In `applySheetData`, after parsing `groupAStats` as `ga`, add:

```js
Object.assign(phaseState, createDefaultPhaseState(ga.phaseState || {}))
if (ga.manualCorrectionsByPhase) {
  for (const [phaseKey, value] of Object.entries(ga.manualCorrectionsByPhase)) {
    if (manualCorrectionsByPhase[phaseKey]) Object.assign(manualCorrectionsByPhase[phaseKey], value)
  }
}
```

After `rebuildSkills()`, if saved queue exists:

```js
if (ga.skillQueue) {
  skillQueue.value = buildSkillQueue({
    blueSlots,
    yellowSlots,
    skillTemplateMap: skillTemplateMap.value,
    previousQueue: ga.skillQueue,
  })
}
```

- [ ] **Step 9: Build**

Run:

```bash
cd frontend && npm run build
```

Expected: build passes and existing battle sheet still loads.

---

### Task 4: Replace Page Layout With Phase Board UI

**Files:**
- Modify: `frontend/src/views/BattleSheetPage.vue`
- Modify: `frontend/src/components/battle/PhaseNav.vue`
- Modify: `frontend/src/components/battle/SkillQueuePanel.vue`

**Interfaces:**
- Consumes phase state from Task 3.
- Produces visible phase-board workflow.

- [ ] **Step 1: Wrap the main content in phase board layout**

In the template after the header, create:

```vue
<div class="phase-board-layout">
  <PhaseNav
    :phases="PHASES"
    :current-phase="currentPhase"
    :phase-state="phaseState"
    :warnings-by-phase="warningsByPhase"
    @select="setCurrentPhase"
  />

  <main class="phase-board-main">
    <section v-show="currentPhase === 'FORMATION'" class="phase-card">
      <!-- move existing formations + stat table here -->
    </section>

    <section v-show="currentPhase !== 'FORMATION' && currentPhase !== 'RESULT'" class="phase-card">
      <SkillQueuePanel
        :phase-label="currentPhaseMeta.label"
        :queue="queueForCurrentPhase"
        :selected-skill-id="selectedSkill?.id || ''"
        @select-skill="selectSkillQueueItem"
        @update-skill="updateSkillQueueItem"
        @confirm-phase="confirmCurrentPhase"
      />
    </section>

    <section v-show="currentPhase === 'RESULT'" class="phase-card">
      <!-- move final winrate table + confirm settlement here -->
    </section>
  </main>

  <aside class="phase-board-side">
    <!-- Task 5 preview + summary components go here -->
  </aside>
</div>
```

Move existing blocks instead of duplicating them:
- formations and stat table into `FORMATION`
- tactics, pre-battle, mana, correction, skill queue into relevant phase cards
- final winrate into `RESULT`

- [ ] **Step 2: Keep old skill checklist temporarily hidden**

Remove the old checkbox-based skill section from visible flow once `SkillQueuePanel` renders. Do not delete the old `availableSkills` state until build and save/restore are verified.

- [ ] **Step 3: Add styles for layout**

Add scoped CSS:

```css
.phase-board-layout {
  display: grid;
  grid-template-columns: 190px minmax(0, 1fr) 320px;
  gap: 1rem;
  align-items: start;
  margin-top: 1rem;
}

.phase-nav,
.phase-board-side,
.phase-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: #fff;
  box-shadow: var(--shadow-md);
}

.phase-nav {
  position: sticky;
  top: 1rem;
  padding: 0.75rem;
}

.phase-nav-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
  padding: 0.65rem 0.75rem;
  margin-bottom: 0.4rem;
  border: 1px solid transparent;
  border-radius: 12px;
  color: var(--color-text-secondary);
  background: transparent;
  cursor: pointer;
}

.phase-nav-item.active {
  border-color: var(--color-accent);
  color: var(--color-primary-dark);
  background: #fffaf0;
}

.phase-nav-item.confirmed small {
  color: #1e7d4f;
}

.phase-card {
  padding: 1rem;
}

.phase-board-side {
  position: sticky;
  top: 1rem;
  padding: 1rem;
}

@media (max-width: 1100px) {
  .phase-board-layout {
    grid-template-columns: 1fr;
  }
  .phase-nav,
  .phase-board-side {
    position: static;
  }
}
```

- [ ] **Step 4: Build and visual check**

Run:

```bash
cd frontend && npm run build
```

Expected: build passes. Manual browser check should show left phase nav, center current phase, and no duplicated old skill checklist.

---

### Task 5: Add Impact Preview and Sticky Summary

**Files:**
- Create: `frontend/src/components/battle/SkillImpactPreview.vue`
- Create: `frontend/src/components/battle/BattleSummaryPanel.vue`
- Modify: `frontend/src/views/BattleSheetPage.vue`

**Interfaces:**
- `SkillImpactPreview` consumes `skill`, `phaseEffects`, `beforeResult`, `afterResult`.
- `BattleSummaryPanel` consumes totals, comparisons, win-rate chain, warnings, mana summary.

- [ ] **Step 1: Create `SkillImpactPreview.vue`**

Use:

```vue
<script setup>
defineProps({
  skill: { type: Object, default: null },
  phaseEffects: { type: Object, required: true },
})
</script>

<template>
  <section class="impact-preview">
    <h3>技能影响预览</h3>
    <div v-if="!skill" class="empty-preview">选择一个技能查看影响。</div>
    <template v-else>
      <h4>{{ skill.skillName }}</h4>
      <p class="preview-meta">{{ skill.characterName }} · 原等级 {{ skill.originalRank || '未填' }} · 生效等级 {{ skill.effectiveRank || '未填' }}</p>
      <p v-if="skill.selectedStat">选择属性：{{ skill.selectedStat }}</p>
      <p v-if="skill.gmNote">GM 备注：{{ skill.gmNote }}</p>
      <details v-if="skill.template?.rawText" open>
        <summary>技能原文</summary>
        <pre>{{ skill.template.rawText }}</pre>
      </details>
      <div class="preview-effects">
        <strong>当前工序已套用</strong>
        <ul>
          <li v-for="line in phaseEffects.applied" :key="line">{{ line }}</li>
          <li v-for="line in phaseEffects.manual" :key="line">{{ line }}</li>
        </ul>
      </div>
    </template>
  </section>
</template>
```

- [ ] **Step 2: Create `BattleSummaryPanel.vue`**

Use:

```vue
<script setup>
defineProps({
  winRateChain: { type: Object, required: true },
  statComparisonSummary: { type: Object, required: true },
  warnings: { type: Array, default: () => [] },
  activatedSummary: { type: Array, default: () => [] },
})
</script>

<template>
  <section class="battle-summary-panel">
    <h3>结算摘要</h3>
    <div class="summary-kpi">
      <span>基础胜率</span>
      <strong>{{ statComparisonSummary.baseWinRate }}%</strong>
    </div>
    <div class="summary-kpi">
      <span>蓝方最终</span>
      <strong>{{ winRateChain.blueFinal }}%</strong>
    </div>
    <div class="summary-kpi">
      <span>黄方最终</span>
      <strong>{{ winRateChain.yellowFinal }}%</strong>
    </div>
    <div class="summary-kpi">
      <span>双方胜率 K</span>
      <strong>{{ winRateChain.blueK }} / {{ winRateChain.yellowK }}</strong>
    </div>

    <div v-if="activatedSummary.length" class="summary-block">
      <h4>已进入计算</h4>
      <ul><li v-for="line in activatedSummary" :key="line">{{ line }}</li></ul>
    </div>

    <div v-if="warnings.length" class="summary-block warning-block">
      <h4>未处理提示</h4>
      <ul><li v-for="line in warnings" :key="line">{{ line }}</li></ul>
    </div>
  </section>
</template>
```

- [ ] **Step 3: Wire side panel into `BattleSheetPage.vue`**

Import:

```js
import SkillImpactPreview from '../components/battle/SkillImpactPreview.vue'
import BattleSummaryPanel from '../components/battle/BattleSummaryPanel.vue'
```

Render in `.phase-board-side`:

```vue
<SkillImpactPreview :skill="selectedSkill" :phase-effects="currentPhaseEffects" />
<BattleSummaryPanel
  :win-rate-chain="winRateChain"
  :stat-comparison-summary="statComparisonSummary"
  :warnings="phaseWarnings"
  :activated-summary="activatedTemplateSummary"
/>
```

- [ ] **Step 4: Add side panel CSS**

Add:

```css
.impact-preview,
.battle-summary-panel {
  margin-bottom: 1rem;
}

.impact-preview h3,
.battle-summary-panel h3 {
  margin: 0 0 0.75rem;
  color: var(--color-primary-dark);
}

.impact-preview pre {
  white-space: pre-wrap;
  max-height: 180px;
  overflow: auto;
  padding: 0.65rem;
  border-radius: 10px;
  background: #f8f5ec;
}

.summary-kpi {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.35rem 0;
  border-bottom: 1px solid var(--color-border);
}

.summary-kpi strong {
  color: var(--color-accent);
}

.warning-block {
  padding: 0.65rem;
  border-radius: 10px;
  background: #fff7e3;
}
```

- [ ] **Step 5: Build**

Run:

```bash
cd frontend && npm run build
```

Expected: build passes and side panel renders preview plus summary.

---

### Task 6: Settlement Guards and Smoke Validation

**Files:**
- Modify: `frontend/src/views/BattleSheetPage.vue`
- Modify: `frontend/src/composables/useBattlePhaseBoard.test.mjs`

**Interfaces:**
- Consumes `phaseWarnings`.
- Produces safer `confirmSettlement` flow.

- [ ] **Step 1: Add confirmation guard for unresolved items**

At the start of `confirmSettlement`, after selected blue slot check and before final `window.confirm`, add:

```js
if (phaseWarnings.value.length) {
  const unresolved = phaseWarnings.value.slice(0, 8).join('\n')
  const okWarnings = window.confirm(`还有未处理项目：\n${unresolved}\n\n确认这些已经由 GM 手动处理，并继续结算吗？`)
  if (!okWarnings) return
}
```

- [ ] **Step 2: Add regression test for disabled passive**

Append to `useBattlePhaseBoard.test.mjs`:

```js
const disabledPassive = queue.map(item => item.skillName === '勇猛'
  ? { ...item, status: STATUS.DISABLED }
  : item)
const disabledSummary = applyQueueEffects({ queue: disabledPassive, phaseKey: 'PASSIVE' })
assert.equal(disabledSummary.blueWinRate, 0)
```

Run:

```bash
node frontend/src/composables/useBattlePhaseBoard.test.mjs
```

Expected: pass.

- [ ] **Step 3: Build frontend**

Run:

```bash
cd frontend && npm run build
```

Expected: pass.

- [ ] **Step 4: Manual smoke test with test servants**

Use the app manually:

1. Start backend and frontend using the existing project commands.
2. Open a campaign with uploaded test servants.
3. Enter battle sheet.
4. Select blue main Saber 阿尔托莉雅 and blue support Archer 阿拉什.
5. Enter yellow main Lancer 库丘林 and support Rider 美杜莎.
6. Go to 常驻检查.
7. Confirm passive skills appear on by default.
8. Disable 石化之魔眼 or mark it manual if it appears.
9. Go to 主要工序.
10. Apply 魔力放出, choose 筋力.
11. Confirm the side summary changes by +10 strength and +5 blue win rate.
12. Save sheet.
13. Reload page.
14. Confirm phase state and skill queue restore.
15. Confirm settlement and verify blue mana writeback still works.

Expected: no console errors, save succeeds, reload restores queue, settlement lock still works.

---

## Self-Review Notes

- Spec coverage: The plan covers phase navigation, passive default-on behavior, GM status control, effective rank field, skill queue, selected-stat effects, impact preview, sticky summary, persistence, unresolved warnings, and settlement guard.
- Scope control: The plan does not implement full automatic adjudication for stone, instant death, counter, support, or resistance effects.
- Type consistency: `STATUS`, `PHASES`, `skillQueue`, `phaseState`, `manualCorrectionsByPhase`, and event names are consistently used across tasks.
- Placeholder scan: No implementation step uses unspecified placeholders; where manual smoke testing is required, exact steps are listed.
