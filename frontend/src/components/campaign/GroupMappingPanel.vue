<template>
  <div class="sheet">
    <div class="head-row">
      <h3 class="sheet-title">群映射（哪个 QQ 群 = 什么用途）</h3>
      <button class="btn small" :disabled="detecting" @click="doDetect">
        {{ detecting ? '识别中…' : '从机器人所在群自动识别' }}
      </button>
    </div>
    <p class="sheet-note">
      查公告、催交、AI 收行动都靠它找群。点"自动识别"拉取机器人所在的群并按群名猜用途，确认无误后保存。
    </p>

    <!-- 自动识别候选表 -->
    <div v-if="candidates.length" class="cand-block">
      <h4 class="cand-title">
        识别结果（{{ candidates.length }} 个群；已按"是否像本战役"排序，默认只勾选相关的）
      </h4>
      <table class="sheet-table">
        <thead>
          <tr>
            <th style="width: 34px"></th>
            <th>相关度</th>
            <th>群名</th>
            <th>群号</th>
            <th>类型</th>
            <th>职阶</th>
            <th>关联灵脉</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in candidates" :key="c.groupId" :class="{ 'row-unrelated': c.relevance === 'unrelated' || c.relevance === 'low' }">
            <td><input type="checkbox" v-model="c.checked" /></td>
            <td>
              <span class="rel-badge" :data-level="c.relevance">{{ relText(c.relevance) }}</span>
              <div class="rel-reason">{{ c.reason }}</div>
            </td>
            <td>{{ c.groupName || '（无群名）' }}</td>
            <td>{{ c.groupId }}</td>
            <td>
              <select v-model="c.kind" class="select small-select">
                <option value="private">私组（收行动）</option>
                <option value="public">公屏</option>
                <option value="gm">GM 群</option>
                <option value="leyline">灵脉群</option>
              </select>
            </td>
            <td>
              <select v-model="c.class" class="select small-select" :disabled="c.kind !== 'private'">
                <option :value="null">—</option>
                <option v-for="cls in classes" :key="cls" :value="cls">{{ cls }}</option>
              </select>
            </td>
            <td>
              <select v-model="c.leyline" class="select small-select" :disabled="c.kind !== 'leyline'">
                <option :value="null">—</option>
                <option v-for="l in leylines" :key="l.id" :value="l.name">{{ l.name }}</option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="form-actions">
        <button class="btn primary small" :disabled="saving" @click="doSave">
          {{ saving ? '保存中…' : `保存勾选的群（${checkedCount}）` }}
        </button>
        <button class="btn small" @click="candidates = []">取消</button>
      </div>
    </div>

    <!-- 已配置映射列表 -->
    <table v-if="bindings.length" class="sheet-table">
      <thead>
        <tr><th>群名</th><th>群号</th><th>类型</th><th>职阶</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="b in bindings" :key="b.id">
          <td>{{ b.group_name || '—' }}</td>
          <td>{{ b.group_id }}</td>
          <td>{{ kindText(b.kind) }}{{ b.leyline ? `（${b.leyline}）` : '' }}</td>
          <td>{{ b.class || '—' }}</td>
          <td><button class="btn small danger" @click="doDelete(b)">删</button></td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="!candidates.length" class="empty-tip">还没有登记群映射。点右上"从机器人所在群自动识别"开始。</p>

    <p v-if="msg" class="sheet-note">{{ msg }}</p>
  </div>
</template>

<script setup>
// 群映射面板：自动识别机器人所在群 → 用户确认类型/职阶 → 批量保存
import { ref, computed, watch } from 'vue'
import { useCurrentCampaign } from '../../composables/useCurrentCampaign'
import {
  listGroupBindings, autoDetectGroups, saveGroupBindings, deleteGroupBinding,
} from '../../services/engine'
import { listLeylines } from '../../services/leyline'

const { current } = useCurrentCampaign()
const campaignId = computed(() => current.value?.id)

const bindings = ref([])
const candidates = ref([])
const leylines = ref([])
const detecting = ref(false)
const saving = ref(false)
const msg = ref('')

const classes = ['弓', '枪', '骑', '剑', '杀', '术', '狂']
const checkedCount = computed(() => candidates.value.filter(c => c.checked).length)

function kindText(kind) {
  return { private: '私组', public: '公屏', gm: 'GM 群', leyline: '灵脉群' }[kind] || kind
}

// 相关度徽标文案
function relText(level) {
  return {
    high: '很可能是本战役',
    medium: '可能相关',
    low: '无圣杯信号',
    unrelated: '疑似私骰/其他团',
  }[level] || level
}

async function refresh() {
  if (!campaignId.value) { bindings.value = []; return }
  try {
    bindings.value = await listGroupBindings(campaignId.value)
  } catch {
    bindings.value = []
  }
}

async function doDetect() {
  detecting.value = true
  msg.value = ''
  try {
    // 顺带拉灵脉表（灵脉群的"关联灵脉"下拉选项）
    const [r, leys] = await Promise.all([
      autoDetectGroups(campaignId.value),
      listLeylines(campaignId.value).catch(() => []),
    ])
    leylines.value = Array.isArray(leys) ? leys : (leys?.items || [])
    // 默认只勾选高/中相关度（私骰群等无关群不勾，避免误保存）
    // 类型/职阶/灵脉都按后端建议值预填（suggestedKind/suggestedClass/suggestedLeyline）
    candidates.value = (r.candidates || []).map(c => ({
      ...c,
      kind: c.suggestedKind || 'private',
      class: c.suggestedClass || null,
      leyline: c.suggestedLeyline || null,
      checked: c.relevance === 'high' || c.relevance === 'medium',
    }))
    if (!candidates.value.length) msg.value = '机器人所在的群都已登记，没有新群可识别。'
  } catch (e) {
    msg.value = `识别失败：${e.message}`
  } finally {
    detecting.value = false
  }
}

async function doSave() {
  const items = candidates.value
    .filter(c => c.checked)
    .map(c => ({
      group_id: c.groupId,
      group_name: c.groupName,
      kind: c.kind,
      class: c.class,
      leyline: c.kind === 'leyline' ? (c.leyline || null) : null,
    }))
  if (!items.length) return
  saving.value = true
  try {
    const r = await saveGroupBindings(campaignId.value, items)
    msg.value = `已保存 ${r.saved} 个群映射`
    candidates.value = []
    await refresh()
  } catch (e) {
    msg.value = `保存失败：${e.message}`
  } finally {
    saving.value = false
  }
}

async function doDelete(b) {
  if (!window.confirm(`删除群映射「${b.group_name || b.group_id}」？`)) return
  try {
    await deleteGroupBinding(b.id)
    await refresh()
  } catch (e) {
    msg.value = `删除失败：${e.message}`
  }
}

watch(campaignId, refresh, { immediate: true })
</script>

<style scoped>
.head-row { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; }
.head-row .sheet-title { margin-bottom: 0.4rem; }
.cand-block { margin: 0.5rem 0 0.9rem; padding-top: 0.5rem; border-top: 1px dashed var(--c-line); }
.cand-title { margin: 0 0 0.4rem; font-size: 0.86rem; color: var(--c-primary); }
.small-select { font-size: 0.82rem; padding: 0.2rem 0.4rem; }
.form-actions { display: flex; gap: 0.6rem; margin-top: 0.6rem; }

/* 相关度徽标：颜色区分置信度 */
.rel-badge {
  display: inline-block;
  font-size: 0.78rem;
  border-radius: var(--radius);
  padding: 0.1rem 0.45rem;
  white-space: nowrap;
}
.rel-badge[data-level="high"] { background: var(--c-ok-soft); color: var(--c-ok); }
.rel-badge[data-level="medium"] { background: var(--c-primary-soft); color: var(--c-primary); }
.rel-badge[data-level="low"], .rel-badge[data-level="unrelated"] {
  background: var(--c-head);
  color: var(--c-ink-2);
}
.rel-reason { font-size: 0.74rem; color: var(--c-ink-2); margin-top: 0.1rem; }
.row-unrelated { opacity: 0.6; }
</style>
