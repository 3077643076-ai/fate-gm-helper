import { ref, computed } from 'vue'
import { usePersistedRef } from './usePersistedRef'
import { listCampaigns, createCampaign, deleteCampaign } from '../services/campaign'
import { getCurrentRound } from '../services/round'

export function useCampaignManager(route, router) {
  const campaigns = ref([])
  const loading = ref(false)
  const searchQuery = usePersistedRef('battle-ctrl:searchQuery', '')
  const selectedCampaigns = ref(new Set())
  const showCreateDialog = ref(false)
  const showDeleteDialog = ref(false)
  const newCampaignName = ref('')
  const newCampaignDescription = ref('')
  const selectAll = ref(false)
  const campaignId = usePersistedRef('battle-ctrl:campaignId', null)
  const campaignName = ref('')

  const filteredCampaigns = computed(() => {
    if (!searchQuery.value.trim()) return campaigns.value
    const query = searchQuery.value.toLowerCase()
    return campaigns.value.filter(c =>
      c.name.toLowerCase().includes(query) ||
      (c.description && c.description.toLowerCase().includes(query))
    )
  })

  const stats = computed(() => {
    const active = campaigns.value.filter(c => !c.completed).length
    const completed = campaigns.value.filter(c => c.completed).length
    return { active, completed, total: campaigns.value.length }
  })

  async function loadCampaigns(onCampaignReady) {
    loading.value = true
    try {
      campaigns.value = await listCampaigns()
      const routeCampaignId = route.params.campaignId
      if (routeCampaignId) {
        const campaign = campaigns.value.find(c => c.id === Number(routeCampaignId))
        if (campaign) {
          campaignId.value = campaign.id
          campaignName.value = campaign.name
          if (onCampaignReady) await onCampaignReady(campaignId.value)
        }
      } else if (campaigns.value.length > 0) {
        const first = campaigns.value[0]
        campaignId.value = first.id
        campaignName.value = first.name
        if (onCampaignReady) await onCampaignReady(campaignId.value)
      }
    } catch (err) {
      console.error('加载战役列表失败:', err)
    } finally {
      loading.value = false
    }
  }

  async function handleCreateCampaign() {
    if (!newCampaignName.value.trim()) { alert('请输入战役名称'); return }
    try {
      const campaign = await createCampaign(newCampaignName.value.trim(), newCampaignDescription.value.trim())
      showCreateDialog.value = false
      newCampaignName.value = ''
      newCampaignDescription.value = ''
      await loadCampaigns()
      campaignId.value = campaign.id
      campaignName.value = campaign.name
      router.push(`/battle-control/${campaign.id}`)
    } catch (err) { alert('创建失败: ' + err.message) }
  }

  async function handleDeleteCampaigns() {
    if (selectedCampaigns.value.size === 0) { alert('请选择要删除的战役'); return }
    try {
      const ids = Array.from(selectedCampaigns.value)
      await Promise.all(ids.map(id => deleteCampaign(id)))
      selectedCampaigns.value.clear()
      selectAll.value = false
      showDeleteDialog.value = false
      await loadCampaigns()
      if (ids.includes(campaignId.value)) {
        if (campaigns.value.length > 0) {
          const first = campaigns.value[0]
          campaignId.value = first.id
          campaignName.value = first.name
          router.push(`/battle-control/${first.id}`)
        } else {
          campaignId.value = null
          campaignName.value = ''
          router.push('/battle-control')
        }
      }
    } catch (err) { alert('删除失败: ' + err.message) }
  }

  function toggleSelectAll() {
    if (selectAll.value) {
      filteredCampaigns.value.forEach(c => selectedCampaigns.value.add(c.id))
    } else {
      filteredCampaigns.value.forEach(c => selectedCampaigns.value.delete(c.id))
    }
  }

  function toggleSelect(id) {
    if (selectedCampaigns.value.has(id)) {
      selectedCampaigns.value.delete(id)
    } else {
      selectedCampaigns.value.add(id)
    }
    selectAll.value = filteredCampaigns.value.length > 0 &&
      filteredCampaigns.value.every(c => selectedCampaigns.value.has(c.id))
  }

  async function selectCampaign(campaign) {
    campaignId.value = campaign.id
    campaignName.value = campaign.name
    router.push(`/battle-control/${campaign.id}`)
    return campaign.id
  }

  function goToCharacterCardUpload(id) {
    router.push(`/character-card-upload/${id}`)
  }

  return {
    campaigns, loading, searchQuery, selectedCampaigns,
    showCreateDialog, showDeleteDialog, newCampaignName, newCampaignDescription,
    selectAll, campaignId, campaignName,
    filteredCampaigns, stats,
    loadCampaigns, handleCreateCampaign, handleDeleteCampaigns,
    toggleSelectAll, toggleSelect, selectCampaign, goToCharacterCardUpload,
  }
}
