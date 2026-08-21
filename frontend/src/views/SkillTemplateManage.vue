<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { createSkillTemplate, deleteSkillTemplate, listSkillTemplates, updateSkillTemplate } from '../services/skillTemplate'

const timings = ['常驻', '随时', '战斗开始时', '初始工序', '主要工序', '最终工序']
const positions = ['不限', '主力位', '辅助位', '支援位']
const statKeys = [
  { key: 'strength', label: '筋力' },
  { key: 'endurance', label: '耐久' },
  { key: 'agility', label: '敏捷' },
  { key: 'mana', label: '魔力' },
  { key: 'luck', label: '幸运' },
  { key: 'noblePhantasm', label: '宝具' },
]

const loading = ref(false)
const saving = ref(false)
const message = ref('')
const keyword = ref('')
const timingFilter = ref('')
const templates = ref([])
const editingId = ref(null)

function emptyForm() {
  return {
    name: '',
    rank: '',
    skillType: '',
    timing: '战斗开始时',
    positionLimit: '不限',
    manaCost: 0,
    cooldown: 0,
    statModifiers: Object.fromEntries(statKeys.map(s => [s.key, 0])),
    winRateModifier: 0,
    enemyWinRateModifier: 0,
    statusEffects: '',
    effectsText: '[]',
    conditionsText: '[]',
    manualJudgment: false,
    sourceBook: '',
    sourceSection: '',
    rawText: '',
    notes: '',
  }
}

const form = reactive(emptyForm())

const selectedTemplate = computed(() => templates.value.find(t => t.id === editingId.value) || null)

function resetForm() {
  Object.assign(form, emptyForm())
  editingId.value = null
}

function parseJsonObject(value, fallback = {}) {
  if (!value) return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function parseJsonArrayText(text, fallback = []) {
  try {
    const parsed = JSON.parse(text || '[]')
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function stringifyJson(value, fallback = []) {
  return JSON.stringify(value || fallback, null, 2)
}

function editTemplate(template) {
  editingId.value = template.id
  const statModifiers = parseJsonObject(template.statModifiers, {})
  Object.assign(form, {
    name: template.name || '',
    rank: template.rank || '',
    skillType: template.skillType || '',
    timing: template.timing || '战斗开始时',
    positionLimit: template.positionLimit || '不限',
    manaCost: template.manaCost || 0,
    cooldown: template.cooldown || 0,
    statModifiers: { ...emptyForm().statModifiers, ...statModifiers },
    winRateModifier: template.winRateModifier || 0,
    enemyWinRateModifier: template.enemyWinRateModifier || 0,
    statusEffects: template.statusEffects || '',
    effectsText: stringifyJson(template.effects || parseJsonObject(template.effectsJson, []), []),
    conditionsText: stringifyJson(template.conditions || parseJsonObject(template.conditionsJson, []), []),
    manualJudgment: Boolean(template.manualJudgment),
    sourceBook: template.sourceBook || '',
    sourceSection: template.sourceSection || '',
    rawText: template.rawText || '',
    notes: template.notes || '',
  })
}

function buildPayload() {
  return {
    name: form.name.trim(),
    rank: form.rank.trim(),
    skillType: form.skillType.trim(),
    timing: form.timing,
    positionLimit: form.positionLimit,
    manaCost: Number(form.manaCost) || 0,
    cooldown: Number(form.cooldown) || 0,
    statModifiers: JSON.stringify(form.statModifiers),
    winRateModifier: Number(form.winRateModifier) || 0,
    enemyWinRateModifier: Number(form.enemyWinRateModifier) || 0,
    statusEffects: form.statusEffects.trim(),
    effects: parseJsonArrayText(form.effectsText),
    conditions: parseJsonArrayText(form.conditionsText),
    manualJudgment: Boolean(form.manualJudgment),
    sourceBook: form.sourceBook.trim(),
    sourceSection: form.sourceSection.trim(),
    rawText: form.rawText.trim(),
    notes: form.notes.trim(),
  }
}

async function loadTemplates() {
  loading.value = true
  message.value = ''
  try {
    const res = await listSkillTemplates(0, 200, keyword.value.trim(), timingFilter.value)
    templates.value = res?.content || []
  } catch (err) {
    message.value = err.message || '加载技能模板失败'
    templates.value = []
  } finally {
    loading.value = false
  }
}

async function saveTemplate() {
  if (!form.name.trim()) {
    message.value = '请先填写技能名'
    return
  }
  saving.value = true
  message.value = ''
  try {
    const payload = buildPayload()
    if (editingId.value) {
      await updateSkillTemplate(editingId.value, payload)
      message.value = '技能模板已更新'
    } else {
      await createSkillTemplate(payload)
      message.value = '技能模板已创建'
    }
    resetForm()
    await loadTemplates()
  } catch (err) {
    message.value = err.message || '保存技能模板失败'
  } finally {
    saving.value = false
  }
}

async function removeTemplate(template) {
  if (!window.confirm(`确定删除技能模板「${template.name}」吗？`)) return
  try {
    await deleteSkillTemplate(template.id)
    if (editingId.value === template.id) resetForm()
    message.value = '技能模板已删除'
    await loadTemplates()
  } catch (err) {
    message.value = err.message || '删除技能模板失败'
  }
}

function formatStatModifiers(template) {
  const modifiers = parseJsonObject(template.statModifiers, {})
  return statKeys
    .map(s => ({ label: s.label, value: Number(modifiers[s.key]) || 0 }))
    .filter(s => s.value !== 0)
    .map(s => `${s.label}${s.value > 0 ? '+' : ''}${s.value}`)
    .join(' / ') || '无属性补正'
}

onMounted(loadTemplates)
</script>

<template>
  <section class="skill-template-page">
    <header class="archive-hero">
      <div>
        <p class="eyebrow">Chaldea Rule Archive</p>
        <h1>技能模板库</h1>
        <p>先把常用技能结构化：数值自动算，复杂条件保留原文给 GM 裁决。</p>
      </div>
      <div class="hero-seal">術式<br />索引</div>
    </header>

    <div class="toolbar">
      <input v-model="keyword" class="search-input" placeholder="搜索技能名或原文" @keyup.enter="loadTemplates" />
      <select v-model="timingFilter" class="select-input">
        <option value="">全部时机</option>
        <option v-for="timing in timings" :key="timing" :value="timing">{{ timing }}</option>
      </select>
      <button class="btn ghost" @click="loadTemplates" :disabled="loading">{{ loading ? '检索中...' : '检索' }}</button>
      <button class="btn ghost" @click="resetForm">新建空模板</button>
    </div>

    <p v-if="message" class="message">{{ message }}</p>

    <main class="template-layout">
      <section class="editor-panel">
        <div class="panel-title">
          <span>{{ editingId ? '编辑模板' : '录入模板' }}</span>
          <small v-if="selectedTemplate">#{{ selectedTemplate.id }}</small>
        </div>

        <div class="form-grid">
          <label>技能名<input v-model="form.name" placeholder="例如：魔力放出" /></label>
          <label>等级<input v-model="form.rank" placeholder="A / B / EX" /></label>
          <label>类型<input v-model="form.skillType" placeholder="固有 / 职阶 / 宝具" /></label>
          <label>发动时机<select v-model="form.timing"><option v-for="timing in timings" :key="timing" :value="timing">{{ timing }}</option></select></label>
          <label>战斗位限制<select v-model="form.positionLimit"><option v-for="position in positions" :key="position" :value="position">{{ position }}</option></select></label>
          <label>消耗魔力<input v-model.number="form.manaCost" type="number" /></label>
          <label>回转值<input v-model.number="form.cooldown" type="number" /></label>
          <label>己方胜率<input v-model.number="form.winRateModifier" type="number" /></label>
          <label>敌方胜率<input v-model.number="form.enemyWinRateModifier" type="number" /></label>
          <label>来源文件<input v-model="form.sourceBook" placeholder="从者资源库.md" /></label>
          <label>来源章节<input v-model="form.sourceSection" placeholder="基础资源包 / 魔力放出" /></label>
          <label class="check-label"><input v-model="form.manualJudgment" type="checkbox" /> 需要 GM 手动裁决</label>
        </div>

        <div class="stat-editor">
          <span class="section-label">属性补正</span>
          <label v-for="stat in statKeys" :key="stat.key">{{ stat.label }}<input v-model.number="form.statModifiers[stat.key]" type="number" /></label>
        </div>

        <label class="wide-label">状态赋予 JSON / 文字<textarea v-model="form.statusEffects" placeholder='例如：[{"name":"中毒","level":1}]'></textarea></label>
        <label class="wide-label">结构化效果 effects JSON<textarea v-model="form.effectsText" rows="8" placeholder='[{"kind":"win_rate_modifier","target":"self","value":5,"phase":"主要工序"}]'></textarea></label>
        <label class="wide-label">生效条件 conditions JSON<textarea v-model="form.conditionsText" rows="5" placeholder='[{"text":"己方战术为强击或破袭","auto":true}]'></textarea></label>
        <label class="wide-label">技能原文<textarea v-model="form.rawText" rows="5" placeholder="完整保留规则书或角色卡原文，方便 GM 查证"></textarea></label>
        <label class="wide-label">备注<textarea v-model="form.notes" rows="3" placeholder="记录判例、限制条件或手动裁决说明"></textarea></label>

        <div class="editor-actions">
          <button class="btn primary" @click="saveTemplate" :disabled="saving">{{ saving ? '保存中...' : editingId ? '保存修改' : '创建模板' }}</button>
          <button class="btn ghost" @click="resetForm">清空</button>
        </div>
      </section>

      <section class="list-panel">
        <div class="panel-title">
          <span>模板索引</span>
          <small>{{ templates.length }} 条</small>
        </div>
        <div v-if="loading" class="empty-state">正在翻阅术式档案...</div>
        <div v-else-if="templates.length === 0" class="empty-state">暂无技能模板，先录入常用技能。</div>
        <article v-for="template in templates" :key="template.id" class="template-card" :class="{ active: editingId === template.id }">
          <div class="template-main" @click="editTemplate(template)">
            <div class="template-name"><strong>{{ template.name }}</strong><span v-if="template.rank">{{ template.rank }}</span></div>
            <div class="template-meta">
              <span>{{ template.timing || '未填时机' }}</span>
              <span>{{ template.positionLimit || '不限' }}</span>
              <span>魔力 {{ template.manaCost || 0 }}</span>
              <span v-if="template.manualJudgment">需手动裁决</span>
              <span v-if="template.sourceBook">{{ template.sourceBook }}</span>
            </div>
            <p>{{ formatStatModifiers(template) }}</p>
            <details v-if="template.rawText" class="raw-text-preview">
              <summary>查看原文</summary>
              <pre>{{ template.rawText }}</pre>
            </details>
          </div>
          <button class="delete-btn" @click="removeTemplate(template)">删除</button>
        </article>
      </section>
    </main>
  </section>
</template>

<style scoped>
.skill-template-page {
  min-height: 100vh;
  color: var(--color-text-primary);
}

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

.eyebrow {
  margin: 0 0 0.35rem;
  color: var(--color-accent);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-size: 0.72rem;
}

.archive-hero h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3.2rem);
  color: var(--color-primary-dark);
}

.archive-hero p:last-child {
  margin: 0.45rem 0 0;
  color: var(--color-text-secondary);
}

.hero-seal {
  width: 92px;
  height: 92px;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-accent);
  border-radius: 50%;
  color: var(--color-accent);
  background: #fffaf0;
  text-align: center;
  font-weight: 700;
  letter-spacing: 0.15em;
  box-shadow: inset 0 0 24px rgba(184, 138, 46, 0.14);
}

.toolbar {
  display: flex;
  gap: 0.7rem;
  flex-wrap: wrap;
  margin: 1rem 0;
}

.search-input, .select-input, label input, label select, textarea {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  color: var(--color-text-primary);
  background: #fff;
  outline: none;
}

.search-input:focus, .select-input:focus, label input:focus, label select:focus, textarea:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(184, 138, 46, 0.12);
}

.search-input { min-width: 260px; flex: 1; }
.select-input { min-width: 150px; }

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

.btn.ghost:hover {
  background: #f3f6fb;
}

.btn:disabled { opacity: 0.55; cursor: not-allowed; }

.message {
  border: 1px solid rgba(184, 138, 46, 0.28);
  border-radius: 12px;
  padding: 0.75rem 1rem;
  color: var(--color-primary-dark);
  background: #fff7e3;
}

.template-layout {
  display: grid;
  grid-template-columns: minmax(320px, 1.1fr) minmax(300px, 0.9fr);
  gap: 1rem;
}

.editor-panel, .list-panel {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1rem;
  background: #fff;
  box-shadow: var(--shadow-md);
}

.panel-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  color: var(--color-accent);
  font-weight: 800;
  letter-spacing: 0.08em;
}

.panel-title small { color: var(--color-text-secondary); }

.form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

label, .wide-label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  color: var(--color-text-secondary);
  font-size: 0.82rem;
}

.stat-editor {
  display: grid;
  grid-template-columns: repeat(6, minmax(70px, 1fr));
  gap: 0.65rem;
  margin: 1rem 0;
  padding: 0.85rem;
  border: 1px dashed rgba(184, 138, 46, 0.35);
  border-radius: 14px;
  background: #fffaf0;
}

.section-label {
  grid-column: 1 / -1;
  color: var(--color-accent);
  font-weight: 700;
}

.wide-label { margin-top: 0.75rem; }
textarea { resize: vertical; min-height: 82px; }
.editor-actions { display: flex; gap: 0.7rem; margin-top: 1rem; }

.template-card {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.8rem;
  padding: 0.9rem;
  margin-bottom: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 6px 18px rgba(38, 59, 102, 0.06);
}

.template-card.active {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px rgba(184, 138, 46, 0.16), var(--shadow-md);
}

.template-main { cursor: pointer; }
.template-name { display: flex; gap: 0.5rem; align-items: baseline; color: var(--color-primary-dark); }
.template-name span { color: var(--color-secondary); font-weight: 700; }
.template-meta { display: flex; gap: 0.45rem; flex-wrap: wrap; margin: 0.45rem 0; }
.template-meta span {
  padding: 0.18rem 0.5rem;
  border-radius: 999px;
  color: var(--color-primary);
  background: #eef2f8;
  font-size: 0.76rem;
}
.template-card p { margin: 0; color: var(--color-text-secondary); font-size: 0.86rem; }
.delete-btn {
  align-self: start;
  border: 1px solid rgba(185, 64, 64, 0.35);
  border-radius: 999px;
  color: #a83232;
  background: #fff3f3;
  padding: 0.35rem 0.7rem;
  cursor: pointer;
}
.check-label {
  justify-content: center;
  gap: 0.5rem;
}

.check-label input {
  width: auto;
}

.raw-text-preview {
  margin-top: 0.55rem;
  color: var(--color-text-secondary);
}

.raw-text-preview summary {
  cursor: pointer;
  color: var(--color-accent);
  font-weight: 700;
}

.raw-text-preview pre {
  white-space: pre-wrap;
  margin: 0.45rem 0 0;
  padding: 0.65rem;
  border-radius: 10px;
  background: #f8f5ec;
  max-height: 180px;
  overflow: auto;
}
.empty-state { padding: 2rem; text-align: center; color: var(--color-text-secondary); }

@media (max-width: 980px) {
  .template-layout { grid-template-columns: 1fr; }
  .form-grid, .stat-editor { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
