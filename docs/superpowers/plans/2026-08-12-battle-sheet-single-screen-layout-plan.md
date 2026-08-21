# Battle Sheet Single-Screen Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把战斗表改成更适合 GM 一屏查看的布局：流程导航在顶部，技能影响/战斗摘要在右侧，蓝黄双方默认角色选择控件一致。

**Architecture:** 继续以 `BattleSheetPage.vue` 为页面容器，不新增路由和后端接口。只调整现有模板结构和 scoped CSS；保留现有 `PhaseNav`、`SkillImpactPreview`、`BattleSummaryPanel` 组件，只改变它们在页面中的位置。黄方 slot 数据结构不变，只改变卡片模式/手动模式的呈现方式。

**Tech Stack:** Vue 3 Composition API, Vite, existing scoped CSS, Node assert tests for existing composables.

## Global Constraints

- 主后端仍是 `backend-node`，不改 Spring Boot。
- 不新增数据库表，不改战斗表 JSON 字段结构。
- 不改 QQ/action submission 战斗边界。
- 蓝方和黄方都是 GM 填写的战斗双方。
- 黄方保留手动输入作为临时/未录入角色的 fallback。
- 当前任务只改页面布局和交互呈现，不改技能计算规则。
- 前端固定开发端口为 `3100`，后端固定默认端口为 `8100`。
- 不自动提交，因为仓库里有大量用户 WIP。

---

## File Structure

- Modify: `frontend/src/views/BattleSheetPage.vue`
  - Move `PhaseNav` from the left grid column to a top horizontal phase strip.
  - Move `SkillImpactPreview` and `BattleSummaryPanel` back into a right sidebar.
  - Keep the main phase content in the center column.
  - Change yellow formation rows so card mode uses a full-width character select like blue.
  - Keep yellow manual mode behind a small switch button.
- No new files.
- No backend changes.

---

### Task 1: Re-layout Battle Sheet Shell

**Files:**
- Modify: `frontend/src/views/BattleSheetPage.vue`

**Interfaces:**
- Consumes existing components: `PhaseNav`, `SkillImpactPreview`, `BattleSummaryPanel`.
- Produces page structure:
  - `.phase-flow-top` contains `PhaseNav`.
  - `.phase-board-layout` contains `.phase-board-main` and `.phase-board-side`.
  - `.phase-board-side` stays visible on the right and does not overlap `.phase-board-main`.

- [ ] **Step 1: Inspect current layout block**

Read the template around the current `<div class="phase-board-layout">` and the CSS around `.phase-board-layout`, `.phase-board-main`, `.phase-board-side`.

- [ ] **Step 2: Move `PhaseNav` above the layout grid**

Change the template from:

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
    ...
  </main>

  <aside class="phase-board-side">
    ...
  </aside>
</div>
```

To:

```vue
<div class="phase-flow-top">
  <PhaseNav
    :phases="PHASES"
    :current-phase="currentPhase"
    :phase-state="phaseState"
    :warnings-by-phase="warningsByPhase"
    @select="setCurrentPhase"
  />
</div>

<div class="phase-board-layout">
  <main class="phase-board-main">
    ...
  </main>

  <aside class="phase-board-side">
    ...
  </aside>
</div>
```

Do not change props or event names.

- [ ] **Step 3: Set the main grid to content + sidebar**

Replace the current three-column/two-column CSS with:

```css
.phase-flow-top {
  margin-top: 1rem;
}

.phase-flow-top :deep(.phase-nav) {
  position: static;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  width: 100%;
}

.phase-flow-top :deep(.phase-nav button) {
  flex: 1 1 120px;
  min-width: 110px;
}

.phase-board-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 1rem;
  align-items: start;
  margin-top: 1rem;
}

.phase-board-main {
  display: grid;
  gap: 1rem;
  min-width: 0;
}

.phase-board-side {
  position: sticky;
  top: 1rem;
  padding: 1rem;
  max-height: calc(100vh - 2rem);
  overflow: auto;
}
```

- [ ] **Step 4: Add responsive fallback**

Keep a breakpoint so small screens stack vertically:

```css
@media (max-width: 1100px) {
  .phase-board-layout {
    grid-template-columns: 1fr;
  }

  .phase-board-side {
    position: static;
    max-height: none;
  }
}
```

- [ ] **Step 5: Verify layout in browser**

Run fixed ports:

```bash
cd backend-node && FATE_GM_DB_PATH=../.superpowers/sdd/gm-battle-resolution-smoke.db npm start
cd frontend && npm run dev -- --host 127.0.0.1
```

Open:

```text
http://127.0.0.1:3100/battle-sheet/1
```

Expected visual result:
- Flow buttons appear above the main content.
- Main content is left/center.
- Skill impact and battle summary appear in a right sidebar.
- Sidebar does not cover yellow formation.

---

### Task 2: Make Yellow Card Selection Match Blue by Default

**Files:**
- Modify: `frontend/src/views/BattleSheetPage.vue`

**Interfaces:**
- Consumes existing `yellowSlots`, `onYellowSelectionChanged`, `toggleStatEditor`, `getSlotDisplayName`, `isCardUsed`.
- Produces yellow rows where card mode shows one full-width `.pos-select`, matching blue row width.

- [ ] **Step 1: Replace yellow card-mode controls**

In the yellow formation row, replace the always-visible mode `<select>` with mode-specific controls.

Use this structure:

```vue
<div v-for="pos in yellowSlots" :key="pos.key" class="position-row">
  <span class="pos-label">{{ pos.label }}</span>

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
    <button type="button" class="btn-mode-switch" @click="setYellowSlotMode(pos, 'manual')">手动</button>
    <span v-if="pos.card" class="pos-card-name">{{ getSlotDisplayName(pos) }}</span>
  </template>

  <template v-else>
    <input v-model="pos.name" type="text" class="name-input" placeholder="输入名称" />
    <button type="button" class="btn-edit-stats" @click="toggleStatEditor(pos.key)">
      {{ pos.showStats ? '收起' : '属性' }}
    </button>
    <button type="button" class="btn-mode-switch" @click="setYellowSlotMode(pos, 'card')">选卡</button>
    <div v-if="pos.showStats" class="stat-editor">
      <div v-for="stat in statKeys" :key="stat.key" class="stat-cell">
        <label>{{ stat.label }}</label>
        <input type="number" v-model.number="pos.stats[stat.key]" min="0" class="stat-input" />
      </div>
    </div>
  </template>
</div>
```

- [ ] **Step 2: Add a small mode switch handler**

Add near `onYellowSelectionChanged()`:

```js
function setYellowSlotMode(slot, mode) {
  slot.mode = mode
  if (mode === 'manual') {
    slot.cardId = null
    slot.card = null
  }
  if (mode === 'card') {
    slot.showStats = false
  }
  onYellowSelectionChanged()
}
```

- [ ] **Step 3: Style the small switch button**

Add CSS near `.btn-edit-stats`:

```css
.btn-mode-switch {
  padding: 0.25rem 0.6rem;
  font-size: 0.8rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-primary);
  background: #fff;
  cursor: pointer;
  white-space: nowrap;
}

.btn-mode-switch:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
```

- [ ] **Step 4: Verify DOM widths**

In browser console or Playwright, measure the first blue and yellow card-mode selects:

```js
(() => {
  const blue = document.querySelector('.blue-side .pos-select').getBoundingClientRect().width
  const yellow = document.querySelector('.yellow-side .pos-select').getBoundingClientRect().width
  return { blue, yellow, diff: Math.abs(blue - yellow) }
})()
```

Expected: `diff <= 40`. The yellow select can be slightly narrower because of the small `手动` button, but it must no longer be half-width.

---

### Task 3: Verification

**Files:**
- Modify only if previous tasks reveal breakage: `frontend/src/views/BattleSheetPage.vue`

**Interfaces:**
- Consumes layout and yellow selector changes from Tasks 1-2.
- Produces verified battle sheet page with no console errors.

- [ ] **Step 1: Run existing composable tests**

Run:

```bash
cd /c/Users/fan/Desktop/medev/继续完成/fate-gm-helper && node frontend/src/composables/useBattleSideSlots.test.mjs && node frontend/src/composables/useBattlePhaseBoard.test.mjs
```

Expected:

```text
useBattleSideSlots tests passed
useBattlePhaseBoard tests passed
```

- [ ] **Step 2: Build frontend**

Run:

```bash
cd /c/Users/fan/Desktop/medev/继续完成/fate-gm-helper/frontend && npm run build
```

Expected: Vite build succeeds.

- [ ] **Step 3: Browser smoke**

Open:

```text
http://127.0.0.1:3100/battle-sheet/1
```

Expected:
- Top flow navigation is visible above the board.
- Right sidebar contains skill impact preview and battle summary.
- Main content shows blue and yellow formations without overlap.
- Blue and yellow card selects are visually consistent.
- Console has no errors.

- [ ] **Step 4: Do not commit**

Do not run `git commit`. Report changed files and verification evidence only.
