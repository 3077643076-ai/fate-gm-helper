<template>
  <section class="battle-sheet-entry">
    <header class="entry-header">
      <div>
        <h1>战斗表</h1>
        <p>先选择要结算的战役，然后进入对应战斗表。</p>
      </div>
      <RouterLink to="/battle-control" class="control-link">去战役控制</RouterLink>
    </header>

    <div v-if="loading" class="entry-card muted">加载战役中...</div>

    <div v-else-if="errorMsg" class="entry-card error-card">
      {{ errorMsg }}
    </div>

    <div v-else-if="campaigns.length === 0" class="entry-card muted">
      当前还没有战役。请先去战役控制页面创建战役。
    </div>

    <template v-else>
      <div v-if="selectedCampaign" class="entry-card selected-card">
        <span>当前战役</span>
        <strong>{{ selectedCampaign.name }}</strong>
        <button type="button" class="btn-primary" @click="openBattleSheet(selectedCampaign.id)">
          进入当前战斗表
        </button>
      </div>

      <div class="campaign-grid">
        <button
          v-for="campaign in campaigns"
          :key="campaign.id"
          type="button"
          class="campaign-card"
          :class="{ selected: selectedCampaign?.id === campaign.id }"
          @click="openBattleSheet(campaign.id)"
        >
          <span>{{ selectedCampaign?.id === campaign.id ? '当前选择' : '选择战役' }}</span>
          <strong>{{ campaign.name }}</strong>
          <small>{{ campaign.description || '无描述' }}</small>
        </button>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getSelectedCampaign, listCampaigns, selectCampaign } from '../services/campaign'

const router = useRouter()
const campaigns = ref([])
const selectedCampaignId = ref(null)
const loading = ref(true)
const errorMsg = ref('')

const selectedCampaign = computed(() => campaigns.value.find(campaign => campaign.id === selectedCampaignId.value) || null)

async function loadEntryData() {
  loading.value = true
  errorMsg.value = ''
  try {
    const [campaignList, selected] = await Promise.all([
      listCampaigns(),
      getSelectedCampaign().catch(() => null),
    ])
    campaigns.value = Array.isArray(campaignList) ? campaignList : []
    selectedCampaignId.value = selected?.id || null
  } catch (error) {
    errorMsg.value = error.message || '加载战役失败'
  } finally {
    loading.value = false
  }
}

async function openBattleSheet(campaignId) {
  await selectCampaign(campaignId)
  router.push(`/battle-sheet/${campaignId}`)
}

onMounted(loadEntryData)
</script>

<style scoped>
.battle-sheet-entry {
  max-width: 1100px;
  margin: 0 auto;
  display: grid;
  gap: 1rem;
}

.entry-header,
.entry-card,
.campaign-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: #fff;
  box-shadow: var(--shadow-md);
}

.entry-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem 1.4rem;
  border-left: 5px solid var(--color-accent);
  background: linear-gradient(135deg, #ffffff, var(--color-card-soft));
}

.entry-header h1 {
  margin: 0 0 0.35rem;
  color: var(--color-primary-dark);
}

.entry-header p,
.entry-card span,
.campaign-card span,
.campaign-card small {
  color: var(--color-text-secondary);
}

.control-link,
.btn-primary {
  border: none;
  border-radius: 999px;
  padding: 0.55rem 1rem;
  color: #fff;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
}

.entry-card {
  padding: 1rem;
}

.selected-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.selected-card strong,
.campaign-card strong {
  color: var(--color-primary-dark);
}

.campaign-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
}

.campaign-card {
  display: grid;
  gap: 0.35rem;
  padding: 1rem;
  text-align: left;
  cursor: pointer;
}

.campaign-card:hover,
.campaign-card.selected {
  border-color: var(--color-accent);
  background: #fffaf0;
}

.error-card {
  color: #a83232;
  background: #fff1f1;
}

.muted {
  color: var(--color-text-secondary);
}

@media (max-width: 700px) {
  .entry-header,
  .selected-card {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
