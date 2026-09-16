<template>
  <div>
    <div class="page-head">
      <h2>灵脉 · 状态与补给</h2>
      <p>灵脉账面 + 驻扎单位 + 效果速览；新建/编辑随时可做</p>
    </div>

    <!-- 灵脉状态表 -->
    <div class="sheet">
      <div class="table-head-row">
        <h3 class="sheet-title">灵脉一览（{{ leylines.length }}）</h3>
        <button class="btn small" @click="startCreate">新建灵脉</button>
      </div>
      <table v-if="leylines.length" class="sheet-table">
        <thead>
          <tr><th>灵脉名</th><th>规模</th><th>人流量</th><th>魔力量</th><th>战场宽度</th><th>驻扎单位</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="l in leylines" :key="l.id">
            <td>{{ l.name }}</td>
            <td>{{ scaleText(l.population_flow) }}</td>
            <td class="num">{{ l.population_flow }}</td>
            <td class="num">{{ l.mana_amount }}</td>
            <td class="num">{{ l.battlefield_width }}</td>
            <td>{{ assignedText(l.id) }}</td>
            <td class="op-cell">
              <button class="btn small" @click="startEdit(l)">编辑</button>
              <button class="btn small danger" @click="doDelete(l)">删</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-tip">本战役还没有灵脉。点右上"新建灵脉"按规则书 6.3 建账。</p>
    </div>

    <!-- 新建/编辑表单 -->
    <div v-if="editing" class="sheet">
      <h3 class="sheet-title">{{ form.id ? `编辑：${form.name}` : '新建灵脉' }}</h3>
      <div class="form-grid">
        <label>名称<input v-model="form.name" class="input" placeholder="灵脉-A / 洛阳" /></label>
        <label>魔力量<input v-model.number="form.manaAmount" type="number" class="input" /></label>
        <label>人流量<input v-model.number="form.populationFlow" type="number" class="input" /></label>
        <label>战场宽度<input v-model.number="form.battlefieldWidth" type="number" class="input" /></label>
      </div>
      <label class="effect-label">效果描述（被动常驻 / 宣言触发 / 轮次结算，写清楚触发条件）
        <textarea v-model="form.effect" class="input" rows="2" />
      </label>
      <label class="effect-label">备注（可空）<textarea v-model="form.description" class="input" rows="1" /></label>
      <div class="form-actions">
        <button class="btn primary" :disabled="saving || !form.name.trim()" @click="doSave">
          {{ saving ? '保存中…' : '保存' }}
        </button>
        <button class="btn" @click="editing = false">取消</button>
        <span v-if="formMsg" class="sheet-note">{{ formMsg }}</span>
      </div>
    </div>

    <!-- 效果速览 -->
    <div v-if="leylines.length" class="sheet">
      <h3 class="sheet-title">各脉效果速览</h3>
      <ul class="effect-list">
        <li v-for="l in leylines" :key="'e' + l.id">
          <strong>{{ l.name }}</strong>：{{ l.effect || '（未录效果）' }}
        </li>
      </ul>
    </div>

    <!-- 人流变动记录 / 补给分配（后端台账后续批次） -->
    <div class="sheet">
      <h3 class="sheet-title">人流变动记录 / 补给分配</h3>
      <p class="empty-tip">
        人流变动流水（魂食 −1 / 对军 −1 / 对城 −2 / 对界 −3，永久）与每天结束的补给分配需要引擎记账支撑，属后续批次。
        当前人流量以本页账面为准，GM 手动改数（编辑灵脉即可）。
      </p>
    </div>
  </div>
</template>

<script setup>
// 灵脉页：leyline CRUD + 灵脉分配（驻扎单位）展示
import { ref, computed, watch } from 'vue'
import { useCurrentCampaign } from '../../composables/useCurrentCampaign'
import {
  listLeylines, createLeyline, updateLeyline, deleteLeyline, listLeylineAssignments,
} from '../../services/leyline'
import { listCharacterCards } from '../../services/characterCard'

const { current } = useCurrentCampaign()
const campaignId = computed(() => current.value?.id)

const leylines = ref([])
const assignments = ref([])
const cards = ref([])
const editing = ref(false)
const saving = ref(false)
const formMsg = ref('')
const form = ref(emptyForm())

function emptyForm() {
  return { id: null, name: '', manaAmount: 0, populationFlow: 0, battlefieldWidth: 0, effect: '', description: '' }
}

// 规模段位（规则书 6.3：小 5-10 / 中 15-30 / 大 35+）
function scaleText(flow) {
  const n = Number(flow) || 0
  if (n >= 35) return `大（${n}）`
  if (n >= 15) return `中（${n}）`
  return `小（${n}）`
}

// 驻扎单位：灵脉分配表里挂在某脉的角色卡名
function assignedText(leylineId) {
  const names = assignments.value
    .filter(a => (a.leylineId ?? a.leyline_id) === leylineId)
    .map(a => cardName(a.characterCardId ?? a.character_card_id))
  return names.length ? names.join(' + ') : '—'
}

function cardName(cardId) {
  const c = cards.value.find(x => x.id === cardId)
  return c ? (c.code || c.class_name || `卡#${c.id}`) : `卡#${cardId}`
}

function startCreate() {
  form.value = emptyForm()
  editing.value = true
  formMsg.value = ''
}

function startEdit(l) {
  form.value = {
    id: l.id,
    name: l.name,
    manaAmount: l.mana_amount,
    populationFlow: l.population_flow,
    battlefieldWidth: l.battlefield_width,
    effect: l.effect || '',
    description: l.description || '',
  }
  editing.value = true
  formMsg.value = ''
}

async function refresh() {
  if (!campaignId.value) { leylines.value = []; assignments.value = []; cards.value = []; return }
  try {
    const [ls, as, cs] = await Promise.all([
      listLeylines(campaignId.value),
      listLeylineAssignments(campaignId.value),
      listCharacterCards(0, 100, null, campaignId.value),
    ])
    leylines.value = Array.isArray(ls) ? ls : (ls?.items || [])
    assignments.value = Array.isArray(as) ? as : (as?.items || [])
    cards.value = Array.isArray(cs) ? cs : (cs?.items || [])
  } catch {
    leylines.value = []
    assignments.value = []
    cards.value = []
  }
}

async function doSave() {
  saving.value = true
  formMsg.value = ''
  try {
    const f = form.value
    if (f.id) {
      await updateLeyline(f.id, campaignId.value, f.name, f.manaAmount, f.battlefieldWidth, f.populationFlow, f.effect, f.description)
    } else {
      await createLeyline(campaignId.value, f.name, f.manaAmount, f.battlefieldWidth, f.populationFlow, f.effect, f.description)
    }
    editing.value = false
    await refresh()
  } catch (e) {
    formMsg.value = `保存失败：${e.message}`
  } finally {
    saving.value = false
  }
}

async function doDelete(l) {
  if (!window.confirm(`确认删除灵脉「${l.name}」？该操作不可撤销。`)) return
  try {
    await deleteLeyline(l.id)
    await refresh()
  } catch (e) {
    formMsg.value = `删除失败：${e.message}`
  }
}

watch(campaignId, refresh, { immediate: true })
</script>

<style scoped>
.table-head-row { display: flex; align-items: center; justify-content: space-between; }
.table-head-row .sheet-title { margin-bottom: 0.4rem; }
.op-cell { white-space: nowrap; }
.op-cell .btn + .btn { margin-left: 0.35rem; }

.form-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.7rem; margin-bottom: 0.7rem; }
@media (max-width: 760px) { .form-grid { grid-template-columns: 1fr 1fr; } }
.form-grid label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.84rem; color: var(--c-ink-2); }
.effect-label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.84rem; color: var(--c-ink-2); margin-bottom: 0.7rem; }
.form-actions { display: flex; align-items: center; gap: 0.6rem; }

.effect-list { margin: 0; padding-left: 1.2rem; font-size: 0.88rem; line-height: 1.9; }
</style>
