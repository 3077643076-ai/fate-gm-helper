<script setup>
import { ref, onMounted, watch } from 'vue'
import { listCampaigns } from '../services/campaign'
import { listLeylines, createLeyline, updateLeyline, deleteLeyline } from '../services/leyline'

const campaigns = ref([])
const selectedCampaignId = ref(null)
const leylines = ref([])
const selectedLeyline = ref(null)
const loading = ref(false)
const message = ref('')

async function loadCampaigns() {
  try {
    campaigns.value = await listCampaigns()
    if (campaigns.value.length > 0 && !selectedCampaignId.value) {
      selectedCampaignId.value = campaigns.value[0].id
    }
  } catch (err) {
    message.value = err.message || '加载战役列表失败'
  }
}

async function loadLeylines() {
  if (!selectedCampaignId.value) {
    leylines.value = []
    return
  }
  loading.value = true
  message.value = ''
  try {
    const res = await listLeylines(selectedCampaignId.value)
    leylines.value = (res || []).map(ley => ({
      ...ley,
      manaAmount: ley.manaAmount ?? 0,
      battlefieldWidth: ley.battlefieldWidth ?? 0,
      populationFlow: ley.populationFlow ?? 0,
    }))
    // 保持选中项
    if (selectedLeyline.value) {
      const found = leylines.value.find(l => l.id === selectedLeyline.value.id)
      selectedLeyline.value = found || null
    }
  } catch (err) {
    message.value = err.message || '加载灵脉失败'
    leylines.value = []
  } finally {
    loading.value = false
  }
}

function addLeyline() {
  if (!selectedCampaignId.value) {
    alert('请先选择一个战役')
    return
  }
  const newLey = {
    id: null,
    _tempId: Date.now() + Math.random(),
    campaignId: selectedCampaignId.value,
    name: '',
    manaAmount: 0,
    battlefieldWidth: 0,
    populationFlow: 0,
    effect: '',
    description: '',
  }
  leylines.value.push(newLey)
  selectedLeyline.value = newLey
}

async function saveLeyline(leyline) {
  if (!leyline.name.trim()) {
    alert('请输入灵脉名称')
    return
  }
  try {
    message.value = ''
    if (leyline.id) {
      await updateLeyline(
        leyline.id,
        selectedCampaignId.value,
        leyline.name.trim(),
        Number(leyline.manaAmount) || 0,
        Number(leyline.battlefieldWidth) || 0,
        Number(leyline.populationFlow) || 0,
        leyline.effect || '',
        leyline.description || ''
      )
    } else {
      const created = await createLeyline(
        selectedCampaignId.value,
        leyline.name.trim(),
        Number(leyline.manaAmount) || 0,
        Number(leyline.battlefieldWidth) || 0,
        Number(leyline.populationFlow) || 0,
        leyline.effect || '',
        leyline.description || ''
      )
      leyline.id = created.id
    }
    message.value = '已保存灵脉信息'
    await loadLeylines()
  } catch (err) {
    message.value = err.message || '保存失败'
  }
}

async function removeLeyline(leyline) {
  if (leyline.id == null) {
    leylines.value = leylines.value.filter(l => l !== leyline)
    if (selectedLeyline.value === leyline) {
      selectedLeyline.value = null
    }
    return
  }
  if (!window.confirm('确定要删除这个灵脉吗？此操作不可撤销？')) return
  try {
    message.value = ''
    await deleteLeyline(leyline.id)
    await loadLeylines()
    if (selectedLeyline.value && selectedLeyline.value.id === leyline.id) {
      selectedLeyline.value = null
    }
  } catch (err) {
    message.value = err.message || '删除失败'
  }
}

onMounted(async () => {
  await loadCampaigns()
  await loadLeylines()
})

watch(selectedCampaignId, () => {
  selectedLeyline.value = null
  loadLeylines()
})
</script>

<template>
  <section class="page-card">
    <div class="page-head">
      <div>
        <h1 class="page-title">技能 / 灵脉配置</h1>
        <p class="page-subtitle">灵脉管理已迁移至“战役控制”页面。请在对应战役的战役控制界面下进行新增、编辑或删除灵脉。</p>
      </div>
    </div>

    <div class="card">
      <div class="card-body">
        <p class="empty-state">为了集中管理与实时展示，灵脉配置项已移至 <router-link to="/battle-control">战役控制</router-link> → 选择战役 → 下方的“灵脉管理”。</p>
        <p class="message">如果你希望在此保留快速跳转或其它导入导出功能，我可以帮你加回导出/导入按钮。</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-bottom: 1rem;
  flex-wrap: true;
}

.select {
  min-width: 220px;
  border: 1px solid var(--color-border);
  border-radius: 0.6rem;
  padding: 0.55rem 0.75rem;
  font-size: 0.95rem;
  background: #fff;
}

.btn {
  border: none;
  border-radius: 8px;
  padding: 0.5rem 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  box-shadow: 0 4px 8px rgba(102, 126, 234, 0.25);
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.35);
}

.btn-danger {
  background: #dc2626;
  color: #fff;
}

.btn-sm {
  padding: 0.35rem 0.8rem;
  font-size: 0.85rem;
}

.card {
  background: #fff;
  border-radius: 0.75rem;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  border: 1px solid var(--color-border);
}

.card-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--color-border);
}

.card-title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
}

.card-body {
  padding: 1.2rem 1.5rem;
}

.empty-state {
  padding: 1.5rem;
  text-align: center;
  color: var(--color-text-secondary);
}

.message {
  margin-bottom: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 0.6rem;
  background: #f8f5ff;
  color: #5f3dc4;
  border: 1px solid #e5dbff;
}

.leyline-layout {
  display: grid;
  grid-template-columns: minmax(220px, 320px) minmax(260px, 1fr);
  gap: 1rem;
}

.leyline-list-panel {
  border-right: 1px solid var(--color-border);
  padding-right: 1rem;
}

.leyline-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 360px;
  overflow-y: auto;
}

.leyline-item-summary {
  padding: 0.6rem 0.75rem;
  border-radius: 0.6rem;
  border: 1px solid var(--color-border);
  background: #f8f9ff;
  cursor: pointer;
  transition: all 0.2s ease;
}

.leyline-item-summary:hover {
  background: #eef1ff;
  border-color: #d0d7ff;
}

.leyline-item-summary.active {
  border-color: #6366f1;
  box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.35);
  background: #e0e7ff;
}

.leyline-name-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.25rem;
}

.leyline-name-text {
  font-weight: 600;
}

.leyline-meta {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}

.leyline-detail-panel {
  padding-left: 0.5rem;
}

.leyline-detail {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.detail-row {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.detail-row.three-cols {
  flex-direction: row;
  gap: 0.75rem;
}

.detail-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.detail-label {
  font-size: 0.9rem;
  font-weight: 600;
}

.detail-input {
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.45rem 0.65rem;
  font-size: 0.95rem;
}

.detail-textarea {
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.55rem 0.7rem;
  font-size: 0.9rem;
  resize: vertical;
  min-height: 70px;
}

.detail-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}
</style>
