# 浅色 Fate 风格统一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把战斗表和技能模板页统一成“浅色 Fate 风”，解决战斗表过黑、技能模板过金、全站观感不一致的问题。

**Architecture:** 不改业务逻辑，只改 Vue 单文件组件的样式和全局 CSS 变量。先用 `style.css` 建立统一主题变量，再让战斗表和技能模板页复用同一套浅色页面、卡片、按钮、表单、表格视觉语言。

**Tech Stack:** Vue 3、Vite、Scoped CSS、全局 CSS 变量。

## Global Constraints

- 全部输出和说明用简单中文。
- 不改接口、不改战斗计算、不改状态效果逻辑。
- 不擅自提交用户其它 WIP，不使用 `git add -A` 或 `git add .`。
- 只修改本任务明确相关文件：`frontend/src/style.css`、`frontend/src/views/BattleSheetPage.vue`、`frontend/src/views/SkillTemplateManage.vue`，必要时小改 `frontend/src/components/NavBar.vue`。
- 本次只做视觉统一，不引入新的 UI 库。

---

## File Structure

- `frontend/src/style.css`
  - 负责全局主题变量、页面背景、导航、通用卡片、页脚基础风格。
  - 新增浅色 Fate 风变量：深蓝主色、金色点缀、浅米白背景、白色卡片、浅边框。

- `frontend/src/views/BattleSheetPage.vue`
  - 只改 `<style scoped>`。
  - 把黑色页面背景、深色表格、深色输入框改成浅色卡片风。
  - 保留蓝方/黄方、优势/劣势、危险提示等业务语义颜色。

- `frontend/src/views/SkillTemplateManage.vue`
  - 只改 `<style scoped>`。
  - 把黑金档案风改成和战斗表一致的浅色卡片风。
  - 保留少量金色作为强调，不再大面积黑金背景。

- `frontend/src/components/NavBar.vue`
  - 默认不改模板。
  - 如全局导航样式不能统一，只通过 `style.css` 调整 `.header`、`.nav-link`、`.brand`。

---

### Task 1: 建立全局浅色 Fate 主题

**Files:**
- Modify: `frontend/src/style.css`

**Interfaces:**
- Consumes: 现有 CSS 变量名，如 `--color-primary`、`--color-bg`、`--color-card`。
- Produces: 页面可复用的新旧变量：`--color-primary`、`--color-primary-dark`、`--color-accent`、`--color-bg`、`--color-card`、`--color-border`、`--shadow-md`。

- [ ] **Step 1: 修改全局变量**

把 `:root` 开头变量调整为浅色 Fate 风：

```css
:root {
  --color-primary: #263b66;
  --color-primary-dark: #17243f;
  --color-secondary: #4f6f9f;
  --color-accent: #b88a2e;
  --color-accent-soft: #f4e2b8;
  --color-text-primary: #243044;
  --color-text-secondary: #657086;
  --color-bg: #f6f2ea;
  --color-card: #ffffff;
  --color-card-soft: #fbf8f1;
  --color-border: #e3dccf;
  --radius-md: 0.75rem;
  --radius-lg: 1rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;
  --shadow-md: 0 10px 24px rgba(38, 59, 102, 0.10);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Microsoft YaHei', sans-serif;
  line-height: 1.6;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 2: 调整全局背景和主区域**

```css
body {
  margin: 0;
  background:
    radial-gradient(circle at top left, rgba(184, 138, 46, 0.14), transparent 28rem),
    linear-gradient(180deg, #f9f5ed 0%, var(--color-bg) 45%, #f1ecdf 100%);
  color: var(--color-text-primary);
}

.app-main {
  flex: 1;
  padding: var(--spacing-xl) var(--spacing-lg);
  max-width: 1280px;
  margin: 0 auto;
  width: 100%;
}
```

- [ ] **Step 3: 调整导航为统一深蓝 + 少量金色**

```css
.header {
  background: linear-gradient(135deg, var(--color-primary-dark), var(--color-primary));
  color: #fff;
  padding: var(--spacing-md) var(--spacing-lg);
  position: sticky;
  top: 0;
  z-index: 10;
  box-shadow: var(--shadow-md);
  border-bottom: 3px solid rgba(184, 138, 46, 0.55);
}

.nav-link.active {
  background-color: rgba(244, 226, 184, 0.22);
  color: #fff3cf;
  font-weight: 600;
}

.footer {
  border-top: 1px solid var(--color-border);
  padding: var(--spacing-lg);
  text-align: center;
  background: rgba(255, 255, 255, 0.72);
}
```

- [ ] **Step 4: 运行构建检查**

Run: `cd frontend && npm run build`

Expected: 构建成功，没有 CSS 或 Vue 编译错误。

---

### Task 2: 统一技能模板页样式

**Files:**
- Modify: `frontend/src/views/SkillTemplateManage.vue`

**Interfaces:**
- Consumes: Task 1 的全局变量。
- Produces: 技能模板页浅色卡片风，类名不变，模板逻辑不变。

- [ ] **Step 1: 只替换 `<style scoped>` 中的颜色和卡片样式**

将 `.skill-template-page` 从黑金背景改为透明浅色页面容器：

```css
.skill-template-page {
  min-height: 100vh;
  color: var(--color-text-primary);
}
```

- [ ] **Step 2: 将 hero 改成白色卡片 + 深蓝标题 + 金色点缀**

```css
.archive-hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1.4rem 1.6rem;
  border: 1px solid var(--color-border);
  border-left: 5px solid var(--color-accent);
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, #ffffff, var(--color-card-soft));
  box-shadow: var(--shadow-md);
}

.archive-hero h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3.2rem);
  color: var(--color-primary-dark);
}

.eyebrow,
.hero-seal,
.panel-title,
.section-label {
  color: var(--color-accent);
}
```

- [ ] **Step 3: 统一表单、按钮、列表卡片**

```css
.search-input, .select-input, label input, label select, textarea {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  color: var(--color-text-primary);
  background: #fff;
  outline: none;
}

.btn {
  border: 1px solid var(--color-primary);
  border-radius: 999px;
  padding: 0.65rem 1rem;
  color: var(--color-primary);
  background: #fff;
  cursor: pointer;
  font-weight: 700;
}

.btn.primary {
  color: #fff;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
}

.editor-panel, .list-panel, .template-card {
  border: 1px solid var(--color-border);
  background: #fff;
  box-shadow: var(--shadow-md);
}
```

- [ ] **Step 4: 保留必要状态色**

```css
.template-card.active {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px rgba(184, 138, 46, 0.16), var(--shadow-md);
}

.delete-btn {
  border: 1px solid rgba(185, 64, 64, 0.35);
  border-radius: 999px;
  color: #a83232;
  background: #fff3f3;
  padding: 0.35rem 0.7rem;
  cursor: pointer;
}
```

- [ ] **Step 5: 运行构建检查**

Run: `cd frontend && npm run build`

Expected: 构建成功，技能模板页无语法错误。

---

### Task 3: 统一战斗表页样式

**Files:**
- Modify: `frontend/src/views/BattleSheetPage.vue`

**Interfaces:**
- Consumes: Task 1 的全局变量。
- Produces: 战斗表浅色卡片风，类名不变，计算逻辑不变。

- [ ] **Step 1: 把页面背景从深黑改为浅色容器**

在 `<style scoped>` 中调整：

```css
.battle-sheet-page {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0;
  color: var(--color-text-primary);
  background: transparent;
}
```

- [ ] **Step 2: 把 header 改成统一白色卡片**

```css
.sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  padding: 1.25rem 1.4rem;
  border: 1px solid var(--color-border);
  border-left: 5px solid var(--color-accent);
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, #ffffff, var(--color-card-soft));
  box-shadow: var(--shadow-md);
}

.sheet-header h1 {
  margin: 0;
  color: var(--color-primary-dark);
}
```

- [ ] **Step 3: 把所有 section/side/mana/card 容器统一为白色卡片**

对这些选择器保留原布局，只统一视觉：

```css
.side,
.stat-table-section,
.skills-section,
.tactics-section,
.pre-battle-section,
.mana-section,
.settlement-section,
.result-section,
.template-summary {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: #fff;
  box-shadow: var(--shadow-md);
}
```

- [ ] **Step 4: 输入框、下拉框、表格改成浅色**

```css
input,
select,
textarea,
.field-input,
.pos-select,
.name-input,
.stat-input,
.mana-input,
.compare-select {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  color: var(--color-text-primary);
  background: #fff;
}

.stat-table,
.compare-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
}

.stat-table th,
.compare-table th {
  color: #fff;
  background: var(--color-primary);
}

.stat-table td,
.compare-table td {
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
}
```

- [ ] **Step 5: 保留业务语义颜色，但降低刺眼程度**

```css
.blue-side h2 { color: #315f9c; }
.yellow-side h2 { color: #a97816; }
.advantage { color: #1e7d4f; font-weight: 700; }
.danger, .mana-penalty { color: #b73535; font-weight: 700; }
.hint, .empty-hint { color: var(--color-text-secondary); }
```

- [ ] **Step 6: 运行构建检查**

Run: `cd frontend && npm run build`

Expected: 构建成功，战斗表页无语法错误。

---

### Task 4: 视觉回归和范围检查

**Files:**
- Inspect only: `frontend/src/style.css`
- Inspect only: `frontend/src/views/BattleSheetPage.vue`
- Inspect only: `frontend/src/views/SkillTemplateManage.vue`

**Interfaces:**
- Consumes: Task 1-3 的样式改动。
- Produces: 可交给用户浏览器测试的说明。

- [ ] **Step 1: 检查是否误改业务逻辑**

Run: `git diff -- frontend/src/style.css frontend/src/views/BattleSheetPage.vue frontend/src/views/SkillTemplateManage.vue`

Expected: diff 只包含 CSS/style 相关变化，不包含 `<script setup>` 计算逻辑变化。

- [ ] **Step 2: 构建检查**

Run: `cd frontend && npm run build`

Expected: 构建成功。

- [ ] **Step 3: 给用户测试步骤**

说明用户可以启动前端并检查：

```bash
cd frontend
npm run dev
```

浏览器检查：
- 首页/导航颜色是否统一。
- `/skill-templates` 是否不再黑金过重。
- `/battle-sheet/:campaignId` 是否不再黑漆漆。
- 表格、输入框、按钮是否都清楚可读。

---

## Self-Review

- Spec coverage: 覆盖了浅色底、深蓝主色、金色点缀、白色卡片、表单表格统一、只改视觉不改业务逻辑。
- Placeholder scan: 没有 TBD/TODO/稍后实现等占位内容。
- Type consistency: 本计划只涉及 CSS 类名和变量，变量名在 Task 1 统一定义，Task 2-3 复用一致。
