# 技能模板结构化与原文保留 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `从者资源库.md` / `御主资源库.md` 的技能规则转成可结算的结构化模板，同时完整保留规则原文供 GM 查证。

**Architecture:** 继续使用 Node + SQLite 后端和 Vue 3 前端。数据库保留现有 `skill_template.raw_text`，新增通用 JSON 字段承载 `effects / conditions / manual`，前端技能模板页负责录入和校验，战斗表负责解释可自动结算的 effects，复杂效果只提示 GM 手动裁决。

**Tech Stack:** Node.js + Express + better-sqlite3；Vue 3 + Vite；SQLite JSON 字段以 TEXT 存储。

## Global Constraints

- 主线后端只改 `backend-node`，不改旧 Spring Boot 后端。
- 不做 AI 自动理解规则；只做规则库文本到结构化模板的半自动/人工确认流程。
- 每个模板必须保留 `rawText` 原文。
- 复杂技能不能强行自动结算，必须标记 `manual: true` 或放入条件确认。
- 已有 `statModifiers / winRateModifier / enemyWinRateModifier / statusEffects` 字段保持兼容，不直接删除。
- 不自动提交 git；提交由用户确认后再做。

---

## File Structure

- Modify: `backend-node/db.js`
  - 给 `skill_template` 补充 `effects_json`、`conditions_json`、`manual_judgment`、`source_book`、`source_section` 字段。
- Modify: `backend-node/routes/skillTemplates.js`
  - API 读写新增字段；兼容旧字段；增加 JSON 校验。
- Create: `backend-node/lib/skillTemplateNormalizer.js`
  - 集中处理技能模板 payload 清洗、JSON 解析、旧字段兼容。
- Create: `backend-node/scripts/importSkillTemplatesFromMd.js`
  - 从资源库 md 半自动抽取技能块，生成可审核模板草稿，写入数据库或输出 JSON。
- Modify: `frontend/src/services/skillTemplate.js`
  - 透传新增字段。
- Modify: `frontend/src/views/SkillTemplateManage.vue`
  - 增加原文、effects、conditions、manual 裁决、来源字段编辑。
- Modify: `frontend/src/views/BattleSheetPage.vue`
  - 技能卡展开原文；按 effects 汇总可自动结算效果；显示需 GM 确认/手动裁决效果。
- Create: `backend-node/test/skillTemplateNormalizer.test.js`
  - 用 Node 内置 `assert` 测试 JSON 清洗和旧字段兼容。
- Create: `backend-node/test/importSkillTemplatesFromMd.test.js`
  - 测试 md 技能块抽取，不要求完全自动理解复杂文本。

---

### Task 1: 后端模板数据结构扩展

**Files:**
- Modify: `backend-node/db.js:160-177`
- Create: `backend-node/lib/skillTemplateNormalizer.js`
- Test: `backend-node/test/skillTemplateNormalizer.test.js`

**Interfaces:**
- Produces: `normalizeSkillTemplatePayload(body: object): object`
- Produces: `formatSkillTemplateRow(row: object): object`
- Produces: `parseJsonText(value: unknown, fallback: unknown): unknown`

- [ ] **Step 1: Write the failing normalizer test**

Create `backend-node/test/skillTemplateNormalizer.test.js`:

```js
const assert = require('assert');
const {
  normalizeSkillTemplatePayload,
  formatSkillTemplateRow,
  parseJsonText,
} = require('../lib/skillTemplateNormalizer');

const effects = [
  { kind: 'win_rate_modifier', target: 'self', value: 10, phase: '主要工序' },
];

const payload = normalizeSkillTemplatePayload({
  name: '魔力放出',
  rank: 'B',
  skillType: '技艺',
  timing: '随时',
  positionLimit: '不限',
  manaCost: '10',
  cooldown: '1',
  statModifiers: JSON.stringify({ strength: 10 }),
  effects: JSON.stringify(effects),
  conditions: [{ text: 'GM 选择筋力/耐久/敏捷之一', auto: false }],
  manualJudgment: false,
  sourceBook: '从者资源库.md',
  sourceSection: '基础资源包-技能一览/魔力放出',
  rawText: '给予自身的[筋力][耐久][敏捷]当中的任一项属性[+15/10/5]。',
  notes: '需要选择属性。',
});

assert.strictEqual(payload.name, '魔力放出');
assert.strictEqual(payload.manaCost, 10);
assert.strictEqual(payload.manualJudgment, 0);
assert.deepStrictEqual(JSON.parse(payload.effectsJson), effects);
assert.deepStrictEqual(JSON.parse(payload.conditionsJson), [{ text: 'GM 选择筋力/耐久/敏捷之一', auto: false }]);
assert.strictEqual(payload.rawText.includes('筋力'), true);

assert.deepStrictEqual(parseJsonText('{bad json', []), []);

const formatted = formatSkillTemplateRow({
  id: 1,
  name: '勇猛',
  rank: 'C',
  skill_type: '天赋',
  timing: '常驻',
  position_limit: '不限',
  mana_cost: 0,
  cooldown: 0,
  stat_modifiers: '{}',
  win_rate_modifier: 30,
  enemy_win_rate_modifier: 0,
  status_effects: null,
  effects_json: '[{"kind":"win_rate_modifier","value":30}]',
  conditions_json: '[{"text":"己方战术为强击或破袭"}]',
  manual_judgment: 0,
  source_book: '从者资源库.md',
  source_section: '勇猛',
  raw_text: '己方战术为[强击]或[破袭]。',
  notes: null,
  created_at: '2026-08-06',
  updated_at: '2026-08-06',
});

assert.strictEqual(formatted.manualJudgment, false);
assert.strictEqual(formatted.effects.length, 1);
assert.strictEqual(formatted.conditions.length, 1);
console.log('skillTemplateNormalizer tests passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node backend-node/test/skillTemplateNormalizer.test.js
```

Expected: FAIL with `Cannot find module '../lib/skillTemplateNormalizer'`.

- [ ] **Step 3: Implement normalizer**

Create `backend-node/lib/skillTemplateNormalizer.js`:

```js
function cleanText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function cleanJsonText(value, fallback = {}) {
  if (value === undefined || value === null || value === '') return JSON.stringify(fallback);
  if (typeof value === 'object') return JSON.stringify(value);
  try {
    JSON.parse(String(value));
    return String(value);
  } catch {
    return JSON.stringify(fallback);
  }
}

function parseJsonText(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function normalizeSkillTemplatePayload(body) {
  return {
    name: cleanText(body.name),
    rank: cleanText(body.rank),
    skillType: cleanText(body.skillType),
    timing: cleanText(body.timing),
    positionLimit: cleanText(body.positionLimit),
    manaCost: Number(body.manaCost) || 0,
    cooldown: Number(body.cooldown) || 0,
    statModifiers: cleanJsonText(body.statModifiers, {}),
    winRateModifier: Number(body.winRateModifier) || 0,
    enemyWinRateModifier: Number(body.enemyWinRateModifier) || 0,
    statusEffects: cleanText(body.statusEffects),
    effectsJson: cleanJsonText(body.effects ?? body.effectsJson, []),
    conditionsJson: cleanJsonText(body.conditions ?? body.conditionsJson, []),
    manualJudgment: body.manualJudgment ? 1 : 0,
    sourceBook: cleanText(body.sourceBook),
    sourceSection: cleanText(body.sourceSection),
    rawText: cleanText(body.rawText),
    notes: cleanText(body.notes),
  };
}

function formatSkillTemplateRow(row) {
  return {
    id: row.id,
    name: row.name,
    rank: row.rank,
    skillType: row.skill_type,
    timing: row.timing,
    positionLimit: row.position_limit,
    manaCost: row.mana_cost ?? 0,
    cooldown: row.cooldown ?? 0,
    statModifiers: row.stat_modifiers,
    winRateModifier: row.win_rate_modifier ?? 0,
    enemyWinRateModifier: row.enemy_win_rate_modifier ?? 0,
    statusEffects: row.status_effects,
    effects: parseJsonText(row.effects_json, []),
    conditions: parseJsonText(row.conditions_json, []),
    effectsJson: row.effects_json,
    conditionsJson: row.conditions_json,
    manualJudgment: Boolean(row.manual_judgment),
    sourceBook: row.source_book,
    sourceSection: row.source_section,
    rawText: row.raw_text,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  cleanText,
  cleanJsonText,
  parseJsonText,
  normalizeSkillTemplatePayload,
  formatSkillTemplateRow,
};
```

- [ ] **Step 4: Add database columns**

In `backend-node/db.js`, after existing `ensureColumns(db, 'battle_sheet', ...)`, add:

```js
  ensureColumns(db, 'skill_template', {
    effects_json: 'TEXT',
    conditions_json: 'TEXT',
    manual_judgment: 'INTEGER DEFAULT 0',
    source_book: 'TEXT',
    source_section: 'TEXT',
  });
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
node backend-node/test/skillTemplateNormalizer.test.js
```

Expected: PASS with `skillTemplateNormalizer tests passed`.

---

### Task 2: 技能模板 API 支持新字段

**Files:**
- Modify: `backend-node/routes/skillTemplates.js`
- Test: manual API smoke test with Node fetch or browser.

**Interfaces:**
- Consumes: `normalizeSkillTemplatePayload()` and `formatSkillTemplateRow()` from Task 1.
- Produces: API response fields `effects`, `conditions`, `manualJudgment`, `sourceBook`, `sourceSection`, `rawText`.

- [ ] **Step 1: Replace local helpers with normalizer import**

At top of `backend-node/routes/skillTemplates.js`, add:

```js
const {
  normalizeSkillTemplatePayload,
  formatSkillTemplateRow,
} = require('../lib/skillTemplateNormalizer');
```

Then replace calls:

```js
const payload = normalizePayload(req.body || {});
```

with:

```js
const payload = normalizeSkillTemplatePayload(req.body || {});
```

Replace `formatTemplate(row)` with `formatSkillTemplateRow(row)` in all GET/POST/PUT handlers.

- [ ] **Step 2: Update INSERT SQL**

Change INSERT column list to include new fields:

```sql
effects_json, conditions_json, manual_judgment, source_book, source_section
```

and add values:

```js
payload.effectsJson,
payload.conditionsJson,
payload.manualJudgment,
payload.sourceBook,
payload.sourceSection,
```

- [ ] **Step 3: Update UPDATE SQL**

Add these assignments before `updated_at`:

```sql
effects_json = ?,
conditions_json = ?,
manual_judgment = ?,
source_book = ?,
source_section = ?,
```

and pass the matching payload values before `id`.

- [ ] **Step 4: Remove duplicate helper functions**

Delete local `normalizePayload`, `formatTemplate`, `cleanText`, and `cleanJsonText` from `backend-node/routes/skillTemplates.js` after imports are used.

- [ ] **Step 5: Run backend syntax check**

Run:

```bash
node -c backend-node/routes/skillTemplates.js
node -c backend-node/db.js
```

Expected: no output and exit code 0.

---

### Task 3: Markdown 技能块半自动导入脚本

**Files:**
- Create: `backend-node/scripts/importSkillTemplatesFromMd.js`
- Test: `backend-node/test/importSkillTemplatesFromMd.test.js`

**Interfaces:**
- Produces: `parseSkillBlocks(markdown: string, sourceBook: string): object[]`
- Produces CLI:
  - Preview: `node backend-node/scripts/importSkillTemplatesFromMd.js --preview 从者资源库.md`
  - Import: `node backend-node/scripts/importSkillTemplatesFromMd.js --import 从者资源库.md`

- [ ] **Step 1: Write failing parser test**

Create `backend-node/test/importSkillTemplatesFromMd.test.js`:

```js
const assert = require('assert');
const { parseSkillBlocks } = require('../scripts/importSkillTemplatesFromMd');

const md = `
##### 魔力放出 A B C
- 类型：技艺 | 发动时机：随时 | 消耗魔力：15/10/5 | 回转：1
- 给予自身的[筋力][耐久][敏捷]当中的任一项属性[+15/10/5]的常驻补正与[+5%]的胜率补正。

##### 勇猛 A B C D E
- 类型：天赋 | 发动时机：常驻 | 消耗魔力：0 | 回转：0
- 己方战术为[强击]或[破袭]且未失效的场合，给予自身[+50/40/30/20/10%]的胜率补正；
`;

const blocks = parseSkillBlocks(md, '从者资源库.md');
assert.strictEqual(blocks.length, 2);
assert.strictEqual(blocks[0].name, '魔力放出');
assert.deepStrictEqual(blocks[0].ranks, ['A', 'B', 'C']);
assert.strictEqual(blocks[0].skillType, '技艺');
assert.strictEqual(blocks[0].timing, '随时');
assert.deepStrictEqual(blocks[0].manaCosts, [15, 10, 5]);
assert.strictEqual(blocks[0].rawText.includes('筋力'), true);
assert.strictEqual(blocks[1].name, '勇猛');
assert.deepStrictEqual(blocks[1].manaCosts, [0, 0, 0, 0, 0]);
console.log('importSkillTemplatesFromMd tests passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node backend-node/test/importSkillTemplatesFromMd.test.js
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement markdown parser**

Create `backend-node/scripts/importSkillTemplatesFromMd.js`:

```js
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db');
const { normalizeSkillTemplatePayload } = require('../lib/skillTemplateNormalizer');

function parseNumberList(text, rankCount) {
  const clean = String(text || '').trim();
  if (!clean) return Array(rankCount).fill(0);
  if (/^\d+$/.test(clean)) return Array(rankCount).fill(Number(clean));
  const parts = clean.split('/').map(v => Number(v.trim()) || 0);
  if (parts.length === rankCount) return parts;
  return Array.from({ length: rankCount }, (_, i) => parts[i] ?? parts[parts.length - 1] ?? 0);
}

function parseSkillBlocks(markdown, sourceBook) {
  const lines = markdown.split(/\r?\n/);
  const blocks = [];
  let current = null;

  function flush() {
    if (current) blocks.push(current);
    current = null;
  }

  for (const line of lines) {
    const title = line.match(/^#####\s+(.+?)\s+((?:EX|[-A-E])(?:\s+(?:EX|[-A-E]))*)\s*$/);
    if (title) {
      flush();
      current = {
        name: title[1].trim(),
        ranks: title[2].trim().split(/\s+/),
        skillType: null,
        timing: null,
        manaCosts: [],
        cooldowns: [],
        tags: [],
        rawLines: [line],
        sourceBook,
      };
      continue;
    }

    if (!current) continue;
    if (/^#{1,5}\s+/.test(line)) {
      flush();
      continue;
    }

    current.rawLines.push(line);
    const meta = line.match(/类型：([^|]+)\|\s*发动时机：([^|]+)\|\s*消耗魔力：([^|]+)\|\s*回转：(.+)$/);
    if (meta) {
      current.skillType = meta[1].trim();
      current.timing = meta[2].trim();
      current.manaCosts = parseNumberList(meta[3], current.ranks.length);
      current.cooldowns = parseNumberList(meta[4], current.ranks.length);
    }

    const tags = [...line.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);
    for (const tag of tags) {
      if (['主力位', '辅助位', '支援', '反击'].includes(tag) && !current.tags.includes(tag)) {
        current.tags.push(tag);
      }
    }
  }
  flush();

  return blocks.map(block => ({
    ...block,
    rawText: block.rawLines.join('\n').trim(),
    manaCosts: block.manaCosts.length ? block.manaCosts : Array(block.ranks.length).fill(0),
    cooldowns: block.cooldowns.length ? block.cooldowns : Array(block.ranks.length).fill(0),
  }));
}

function blockToTemplates(block) {
  return block.ranks.map((rank, index) => normalizeSkillTemplatePayload({
    name: block.name,
    rank,
    skillType: block.skillType,
    timing: block.timing,
    positionLimit: block.tags.includes('主力位') ? '主力位' : '不限',
    manaCost: block.manaCosts[index] ?? 0,
    cooldown: block.cooldowns[index] ?? 0,
    statModifiers: {},
    winRateModifier: 0,
    enemyWinRateModifier: 0,
    effects: [],
    conditions: [],
    manualJudgment: true,
    sourceBook: block.sourceBook,
    sourceSection: block.name,
    rawText: block.rawText,
    notes: '由资源库 md 半自动导入；需人工补充 effects 后再参与自动结算。',
  }));
}

function importTemplates(filePath) {
  const sourceBook = path.basename(filePath);
  const markdown = fs.readFileSync(filePath, 'utf8');
  const blocks = parseSkillBlocks(markdown, sourceBook);
  const templates = blocks.flatMap(blockToTemplates);
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO skill_template (
      name, rank, skill_type, timing, position_limit,
      mana_cost, cooldown, stat_modifiers,
      win_rate_modifier, enemy_win_rate_modifier,
      status_effects, effects_json, conditions_json, manual_judgment,
      source_book, source_section, raw_text, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction(rows => {
    for (const row of rows) {
      stmt.run(
        row.name, row.rank, row.skillType, row.timing, row.positionLimit,
        row.manaCost, row.cooldown, row.statModifiers,
        row.winRateModifier, row.enemyWinRateModifier,
        row.statusEffects, row.effectsJson, row.conditionsJson, row.manualJudgment,
        row.sourceBook, row.sourceSection, row.rawText, row.notes,
      );
    }
  });
  insertMany(templates);
  return templates.length;
}

if (require.main === module) {
  const mode = process.argv[2];
  const file = process.argv[3];
  if (!file || !['--preview', '--import'].includes(mode)) {
    console.error('Usage: node backend-node/scripts/importSkillTemplatesFromMd.js --preview|--import <md-file>');
    process.exit(1);
  }
  const fullPath = path.resolve(file);
  const markdown = fs.readFileSync(fullPath, 'utf8');
  const blocks = parseSkillBlocks(markdown, path.basename(fullPath));
  if (mode === '--preview') {
    console.log(JSON.stringify(blocks.slice(0, 20), null, 2));
  } else {
    const count = importTemplates(fullPath);
    console.log(`Imported ${count} skill template drafts`);
  }
}

module.exports = { parseSkillBlocks, blockToTemplates, importTemplates };
```

- [ ] **Step 4: Run parser test**

Run:

```bash
node backend-node/test/importSkillTemplatesFromMd.test.js
```

Expected: PASS with `importSkillTemplatesFromMd tests passed`.

- [ ] **Step 5: Preview real resource library**

Run:

```bash
node backend-node/scripts/importSkillTemplatesFromMd.js --preview 从者资源库.md
```

Expected: JSON output includes `对魔力`、`骑乘`、`魔力放出` 等技能 blocks and `rawText`.

---

### Task 4: 技能模板管理页支持原文和结构化 effects

**Files:**
- Modify: `frontend/src/views/SkillTemplateManage.vue`
- Modify: `frontend/src/services/skillTemplate.js`

**Interfaces:**
- Consumes API fields: `effects`, `conditions`, `manualJudgment`, `sourceBook`, `sourceSection`, `rawText`.
- Produces payload with same fields.

- [ ] **Step 1: Extend empty form**

In `emptyForm()` add:

```js
effectsText: '[]',
conditionsText: '[]',
manualJudgment: false,
sourceBook: '',
sourceSection: '',
```

- [ ] **Step 2: Load fields into editor**

In `editTemplate(template)`, add:

```js
effectsText: JSON.stringify(template.effects || parseJsonObject(template.effectsJson, []), null, 2),
conditionsText: JSON.stringify(template.conditions || parseJsonObject(template.conditionsJson, []), null, 2),
manualJudgment: Boolean(template.manualJudgment),
sourceBook: template.sourceBook || '',
sourceSection: template.sourceSection || '',
```

- [ ] **Step 3: Build payload with new fields**

In `buildPayload()`, parse JSON safely:

```js
function parseJsonArrayText(text, fallback = []) {
  try {
    const parsed = JSON.parse(text || '[]')
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}
```

Add to returned payload:

```js
effects: parseJsonArrayText(form.effectsText),
conditions: parseJsonArrayText(form.conditionsText),
manualJudgment: Boolean(form.manualJudgment),
sourceBook: form.sourceBook.trim(),
sourceSection: form.sourceSection.trim(),
```

- [ ] **Step 4: Add form UI controls**

After 回转值 input, add:

```vue
<label>来源文件<input v-model="form.sourceBook" placeholder="从者资源库.md" /></label>
<label>来源章节<input v-model="form.sourceSection" placeholder="基础资源包 / 魔力放出" /></label>
<label class="check-label"><input v-model="form.manualJudgment" type="checkbox" /> 需要 GM 手动裁决</label>
```

After 状态赋予 textarea, add:

```vue
<label class="wide-label">结构化效果 effects JSON<textarea v-model="form.effectsText" rows="8" placeholder='[{"kind":"win_rate_modifier","target":"self","value":5,"phase":"主要工序"}]'></textarea></label>
<label class="wide-label">生效条件 conditions JSON<textarea v-model="form.conditionsText" rows="5" placeholder='[{"text":"己方战术为强击或破袭","auto":true}]'></textarea></label>
```

- [ ] **Step 5: Display raw text and manual status in list cards**

Inside each template card meta add:

```vue
<span v-if="template.manualJudgment">需手动裁决</span>
<span v-if="template.sourceBook">{{ template.sourceBook }}</span>
```

Add below effect description:

```vue
<details v-if="template.rawText" class="raw-text-preview">
  <summary>查看原文</summary>
  <pre>{{ template.rawText }}</pre>
</details>
```

- [ ] **Step 6: Build frontend**

Run:

```bash
cd frontend && npm run build
```

Expected: build completes without Vue template errors.

---

### Task 5: 战斗表按 effects 结算并展示原文

**Files:**
- Modify: `frontend/src/views/BattleSheetPage.vue`

**Interfaces:**
- Consumes `template.effects`, `template.conditions`, `template.manualJudgment`, `template.rawText`.
- Produces `templateEffects` in saved `winRateResult` with source skill names and applied effects.

- [ ] **Step 1: Add helper to read template effects**

Near existing skill helpers add:

```js
function getTemplateEffects(template) {
  if (Array.isArray(template.effects)) return template.effects
  return parseJsonObject(template.effectsJson, [])
}

function getTemplateConditions(template) {
  if (Array.isArray(template.conditions)) return template.conditions
  return parseJsonObject(template.conditionsJson, [])
}

function isAutoEffect(effect) {
  return ['stat_modifier', 'win_rate_modifier', 'enemy_win_rate_modifier'].includes(effect.kind)
}
```

- [ ] **Step 2: Extend skill object state**

When pushing skills in `buildAvailableSkills`, include:

```js
conditionsConfirmed: false,
selectedEffectOptions: {},
```

- [ ] **Step 3: Apply effects in template summary calculation**

Replace old template-only calculation with:

```js
const activatedTemplateEffects = computed(() => {
  const result = []
  for (const skill of availableSkills.value) {
    if (!skill.checked || !skill.template) continue
    for (const effect of getTemplateEffects(skill.template)) {
      result.push({ skillName: skill.name, effect, template: skill.template })
    }
  }
  return result
})
```

In the existing computed that totals skill effects, support:

```js
if (effect.kind === 'stat_modifier' && effect.stat) {
  statMods[effect.stat] = (statMods[effect.stat] || 0) + Number(effect.value || 0)
}
if (effect.kind === 'win_rate_modifier') {
  blueWinRate += Number(effect.value || 0)
}
if (effect.kind === 'enemy_win_rate_modifier') {
  yellowWinRate += Number(effect.value || 0)
}
```

Keep old `statModifiers`, `winRateModifier`, `enemyWinRateModifier` fallback when `effects` is empty.

- [ ] **Step 4: Show manual judgment and original text**

Inside skill checkbox card, add:

```vue
<span v-if="sk.template?.manualJudgment" class="manual-badge">需 GM 裁决</span>
<details v-if="sk.template?.rawText" class="skill-raw-text">
  <summary>原文</summary>
  <pre>{{ sk.template.rawText }}</pre>
</details>
```

- [ ] **Step 5: Show conditions**

Inside skill card, add:

```vue
<div v-if="getTemplateConditions(sk.template).length" class="condition-list">
  <p v-for="condition in getTemplateConditions(sk.template)" :key="condition.text || condition">
    条件：{{ condition.text || condition }}
  </p>
</div>
```

- [ ] **Step 6: Build frontend**

Run:

```bash
cd frontend && npm run build
```

Expected: build completes.

---

### Task 6: 录入首批测试技能模板并跑示例战斗

**Files:**
- Modify through API/SQLite data only: `backend-node/data/gm_helper.db`
- No source code files required.

**Interfaces:**
- Consumes import script from Task 3 and template editor from Task 4.
- Produces usable templates for `魔力放出 B`、`勇猛 C`、`骑乘 C/A`、`心眼（真）B` at minimum.

- [ ] **Step 1: Import draft templates from md**

Run:

```bash
node backend-node/scripts/importSkillTemplatesFromMd.js --import 从者资源库.md
```

Expected: command prints imported draft count.

- [ ] **Step 2: Manually edit `魔力放出 B`**

Set:

```json
{
  "effects": [
    {
      "kind": "select_stat_modifier",
      "target": "self",
      "options": ["strength", "endurance", "agility"],
      "value": 10,
      "duration": "回合结束"
    },
    {
      "kind": "win_rate_modifier",
      "target": "self",
      "value": 5,
      "phase": "主要工序"
    }
  ],
  "conditions": [
    { "text": "发动时 GM 选择筋力/耐久/敏捷之一", "auto": false }
  ],
  "manualJudgment": false
}
```

- [ ] **Step 3: Manually edit `勇猛 C`**

Set:

```json
{
  "effects": [
    {
      "kind": "win_rate_modifier",
      "target": "self",
      "value": 30,
      "phase": "主要工序"
    }
  ],
  "conditions": [
    { "text": "己方战术为强击或破袭且未失效", "auto": true },
    { "text": "若自身为主力位且克制敌方战术，此补正翻倍", "auto": true }
  ],
  "manualJudgment": false
}
```

- [ ] **Step 4: Mark difficult skills manual**

For `对魔力`、`石化之魔眼`、`战斗续行` set:

```json
{
  "effects": [],
  "conditions": [],
  "manualJudgment": true,
  "notes": "改变判定或状态流程，当前仅展示原文，不自动进胜率公式。"
}
```

- [ ] **Step 5: Run one battle-sheet smoke test**

Manual browser steps:

1. Start backend: `cd backend-node && npm run dev`
2. Start frontend: `cd frontend && npm run dev`
3. 打开战斗表页面。
4. 蓝方选 Saber 主力、Archer 辅助。
5. 黄方录入或选择 Lancer 主力、Rider 辅助。
6. 勾选技能。
7. 确认每个技能卡能展开原文。
8. 确认可自动 effects 进入胜率汇总。
9. 确认 manual 技能只提示，不自动加数值。

Expected: 技能来源、原文、自动补正、手动裁决状态都可见。

---

## Self-Review

- Spec coverage: 已覆盖结构化字段、原文保留、md 导入、模板页、战斗表结算、首批模板测试。
- Placeholder scan: 无 TBD/TODO/以后再说类占位。
- Type consistency: 后端统一使用 `effectsJson / conditionsJson / manualJudgment`，前端使用 `effects / conditions / manualJudgment`，API formatter 负责转换。
- Scope check: 只做技能模板和战斗表技能结算，不做 AI，不做完整战斗全阶段重构。
