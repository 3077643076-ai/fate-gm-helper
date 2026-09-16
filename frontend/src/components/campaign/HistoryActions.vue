<template>
  <div>
    <div class="page-head">
      <h2>历史行动 · 往期记录查询</h2>
      <p>已关闭回合的快照明细，点行展开行动内容</p>
    </div>

    <!-- 筛选条 -->
    <div class="sheet filter-bar">
      <label class="filter-item">
        回合
        <select v-model="filterRound" class="select">
          <option :value="0">全部</option>
          <option v-for="h in history" :key="h.id" :value="h.roundNumber">
            第 {{ h.roundNumber }} 回合
          </option>
        </select>
      </label>
      <label class="filter-item">
        关键词
        <input v-model="filterKeyword" class="input" placeholder="角色 / 行动内容" />
      </label>
      <span class="filter-item count">共 {{ filtered.length }} 条快照</span>
    </div>

    <!-- 快照列表 -->
    <div v-if="filtered.length" class="sheet">
      <details v-for="h in filtered" :key="h.id" class="round-item">
        <summary>
          第 {{ h.roundNumber }} 回合
          <small>关闭于 {{ (h.closedAt || '—').replace('T', ' ').slice(0, 16) }}</small>
        </summary>
        <div class="round-detail">
          <div v-for="section in detailSections(h)" :key="section.label" class="detail-block">
            <h4>{{ section.label }}（{{ section.items.length }}）</h4>
            <table v-if="section.items.length" class="sheet-table">
              <thead><tr><th>职阶</th><th>内容</th><th>提交人</th></tr></thead>
              <tbody>
                <tr v-for="(a, i) in section.items" :key="i">
                  <td>{{ a.servantClass || a.servant_class || '—' }}</td>
                  <td>{{ a.content || '—' }}</td>
                  <td>{{ a.submittedBy || a.submitted_by || '—' }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="empty-tip">无记录</p>
          </div>
        </div>
      </details>
    </div>
    <p v-else class="empty-tip sheet">没有匹配的历史回合（关回合后自动生成快照）。</p>
  </div>
</template>

<script setup>
// 历史行动页：回合快照列表 + 展开 from者/御主行动明细 + 本地筛选
import { ref, computed, watch } from 'vue'
import { useCurrentCampaign } from '../../composables/useCurrentCampaign'
import { listRoundHistory } from '../../services/round'

const { current } = useCurrentCampaign()
const campaignId = computed(() => current.value?.id)

const history = ref([])
const filterRound = ref(0)
const filterKeyword = ref('')

function parseActions(v) {
  // history 接口返回的 servantActions/masterActions 已是数组（或 null）
  return Array.isArray(v) ? v : []
}

function detailSections(h) {
  return [
    { label: '从者行动', items: parseActions(h.servantActions) },
    { label: '御主行动', items: parseActions(h.masterActions) },
  ]
}

const filtered = computed(() => {
  let list = history.value
  if (filterRound.value) {
    list = list.filter(h => (h.turn_number ?? h.turnNumber) === filterRound.value)
  }
  const kw = filterKeyword.value.trim()
  if (kw) {
    list = list.filter(h => {
      const all = detailSections(h).flatMap(s => s.items)
      return all.some(a =>
        Object.values(a).some(v => String(v ?? '').includes(kw))
      ) || String(h.roundNumber ?? '').includes(kw)
    })
  }
  return list
})

async function refresh() {
  if (!campaignId.value) { history.value = []; return }
  try {
    history.value = await listRoundHistory(campaignId.value)
  } catch {
    history.value = []
  }
}

watch(campaignId, refresh, { immediate: true })
</script>

<style scoped>
.filter-bar { display: flex; gap: 1.2rem; align-items: center; flex-wrap: wrap; margin-bottom: 1rem; }
.filter-item { display: flex; align-items: center; gap: 0.45rem; font-size: 0.88rem; color: var(--c-ink-2); }
.count { margin-left: auto; }

.round-item {
  border: 1px solid var(--c-line);
  border-radius: var(--radius);
  margin-bottom: 0.5rem;
}
.round-item summary {
  cursor: pointer;
  padding: 0.5rem 0.8rem;
  font-weight: 600;
  user-select: none;
}
.round-item summary small { font-weight: 400; color: var(--c-ink-2); margin-left: 0.6rem; }
.round-detail { padding: 0.3rem 0.8rem 0.8rem; border-top: 1px dashed var(--c-line); }
.detail-block h4 { margin: 0.7rem 0 0.35rem; font-size: 0.85rem; color: var(--c-primary); }
</style>
