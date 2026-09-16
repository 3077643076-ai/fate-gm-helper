// 全局战役选择状态：顶栏切换战役后，所有 tab/页面从这里读当前战役
// 数据源是后端的"选中战役"接口（/campaigns/selected），切换时同步调 select 接口持久化
import { ref, readonly } from 'vue'
import { listCampaigns, getSelectedCampaign, selectCampaign } from '../services/campaign'

// 模块级单例：整个应用共享同一份
const campaigns = ref([])
const current = ref(null)        // 当前选中战役对象 { id, name, ... }
const loading = ref(false)

// 初始化：拉战役列表 + 后端记录的选中战役（App 挂载时调一次）
async function init() {
  loading.value = true
  try {
    const [list, selected] = await Promise.all([
      listCampaigns(),
      getSelectedCampaign().catch(() => null),
    ])
    campaigns.value = Array.isArray(list) ? list : []
    current.value = selected || campaigns.value[0] || null
  } finally {
    loading.value = false
  }
}

// 切换战役：写回后端（保持后端"选中战役"与本地一致），再更新本地
async function switchTo(campaignId) {
  const target = campaigns.value.find(c => c.id === campaignId)
  if (!target) return
  try {
    await selectCampaign(campaignId)
  } catch (e) {
    console.error('[campaign] 切换战役失败:', e)
  }
  current.value = target
}

// 战役列表变化后刷新（新建/删除战役后调用）
async function refreshList() {
  const list = await listCampaigns()
  campaigns.value = Array.isArray(list) ? list : []
  // 当前战役被删了就回落到第一 个
  if (current.value && !campaigns.value.some(c => c.id === current.value.id)) {
    current.value = campaigns.value[0] || null
  }
}

export function useCurrentCampaign() {
  return {
    campaigns: readonly(campaigns),
    current: readonly(current),
    loading: readonly(loading),
    init,
    switchTo,
    refreshList,
  }
}
