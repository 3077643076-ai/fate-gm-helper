import { ref } from 'vue'
import { listLeylines, createLeyline, updateLeyline, deleteLeyline, listLeylineAssignments, upsertLeylineAssignment, assignLeylineBulk } from '../services/leyline'
import { normalizeClassName, safeNullArray } from '../utils/helpers.js'

export function useLeylineManager(campaignId, characterCards, roundInfo, servantCodes, masterCodes, servantActions, masterActions, servantLeylineIds, masterLeylineIds) {
  const leylines = ref([])
  const selectedLeyline = ref(null)
  const leyLoading = ref(false)
  const assignmentSaving = ref(false)

  async function loadLeylines() {
    if (!campaignId.value) { leylines.value = []; return }
    try {
      const res = await listLeylines(campaignId.value)
      leylines.value = (res || []).map(ley => ({
        ...ley,
        manaAmount: ley.manaAmount ?? 0,
        battlefieldWidth: ley.battlefieldWidth ?? 0,
        populationFlow: ley.populationFlow ?? 0,
        size: ley.size || null,
        sizeLabel: ley.sizeLabel || '',
        ownerCharacterId: ley.ownerCharacterId || null,
        ownerCode: ley.ownerCode || '',
        assignedCharacterIds: ley.assignedCharacterIds || []
      }))
      servantLeylineIds.value = safeNullArray(roundInfo.value.classes.length)
      masterLeylineIds.value = safeNullArray(roundInfo.value.classes.length)
      ;(leylines.value || []).forEach(ley => {
        (ley.assignedCharacterIds || []).forEach(cid => {
          const card = characterCards.value.find(c => c.id === cid)
          if (!card) return
          const cls = normalizeClassName(card.className)
          const idx = roundInfo.value.classes.indexOf(cls)
          if (idx === -1) return
          if (card.cardType === 'SERVANT') servantLeylineIds.value[idx] = ley.id
          else if (card.cardType === 'MASTER') masterLeylineIds.value[idx] = ley.id
        })
      })
    } catch (err) { console.error('加载灵脉失败:', err); leylines.value = [] }
  }

  function getCharactersOnLeyline(leyId) {
    const servants = servantLeylineIds.value
      .map((id, idx) => (id != null && Number(id) === Number(leyId) ? (servantCodes.value[idx] || '-') : null))
      .filter(Boolean)
    const masters = masterLeylineIds.value
      .map((id, idx) => (id != null && Number(id) === Number(leyId) ? (masterCodes.value[idx] || '-') : null))
      .filter(Boolean)
    return { servants, masters }
  }

  function getSubmissionsOnLeyline(leyId) {
    const out = []
    roundInfo.value.classes.forEach((cls, idx) => {
      if (servantLeylineIds.value[idx] == leyId) {
        const code = servantCodes.value[idx] || '-'
        const action = servantActions.value[idx] || ''
        if (action) out.push(`${code}: ${action}`)
      }
      if (masterLeylineIds.value[idx] == leyId) {
        const code = masterCodes.value[idx] || '-'
        const action = masterActions.value[idx] || ''
        if (action) out.push(`${code}: ${action}`)
      }
    })
    return out
  }

  async function loadLeylinesForCampaign() {
    if (!campaignId.value) { leylines.value = []; return }
    leyLoading.value = true
    try {
      const res = await listLeylines(campaignId.value)
      leylines.value = (res || []).map(ley => ({
        ...ley, manaAmount: ley.manaAmount ?? 0,
        battlefieldWidth: ley.battlefieldWidth ?? 0,
        populationFlow: ley.populationFlow ?? 0,
      }))
      if (selectedLeyline.value) {
        const found = leylines.value.find(l => l.id === selectedLeyline.value.id)
        selectedLeyline.value = found || null
      }
    } catch (err) { console.error('加载灵脉失败:', err); leylines.value = [] }
    finally { leyLoading.value = false }
  }

  async function addLeyline() {
    if (!campaignId.value) { alert('请先选择战役'); return }
    try {
      const res = await createLeyline(campaignId.value, '新灵脉', 0, 0, 0, '', '')
      await loadLeylines()
      const found = leylines.value.find(l => l.id === res.id)
      selectedLeyline.value = found || null
    } catch (err) { console.error('新建灵脉失败:', err); alert('新建灵脉失败：' + (err.message || err)) }
  }

  async function saveLeyline(ley) {
    if (!campaignId.value) { alert('请先选择战役'); return }
    try {
      const size = ley.size || null
      const ownerId = ley.ownerCharacterId || null
      if (ley.id) {
        await updateLeyline(ley.id, campaignId.value, ley.name || '', ley.manaAmount || 0, ley.battlefieldWidth || 0, ley.populationFlow || 0, ley.effect || '', ley.description || '', size, ownerId)
      } else {
        const res = await createLeyline(campaignId.value, ley.name || '新灵脉', ley.manaAmount || 0, ley.battlefieldWidth || 0, ley.populationFlow || 0, ley.effect || '', ley.description || '', size, ownerId)
        ley.id = res && res.id ? res.id : ley.id
      }
      await loadLeylines()
      alert('已保存灵脉')
    } catch (err) { console.error('保存灵脉失败:', err); alert('保存灵脉失败：' + (err.message || err)) }
  }

  async function removeLeyline(ley) {
    if (!ley || !ley.id) { alert('请选择一个要删除的灵脉'); return }
    if (!confirm('确定删除该灵脉吗？')) return
    try {
      await deleteLeyline(ley.id)
      selectedLeyline.value = null
      await loadLeylines()
      alert('已删除灵脉')
    } catch (err) { console.error('删除灵脉失败:', err); alert('删除灵脉失败：' + (err.message || err)) }
  }

  async function loadLeylineAssignments() {
    if (!campaignId.value) return
    try {
      const res = await listLeylineAssignments(campaignId.value)
      servantLeylineIds.value = safeNullArray(roundInfo.value.classes.length)
      masterLeylineIds.value = safeNullArray(roundInfo.value.classes.length)
      ;(res || []).forEach(a => {
        const card = characterCards.value.find(c => c.id === a.characterCardId)
        if (!card) return
        const cls = normalizeClassName(card.className)
        const idx = roundInfo.value.classes.indexOf(cls)
        if (idx === -1) return
        if (card.cardType === 'SERVANT') servantLeylineIds.value[idx] = a.leylineId || null
        else masterLeylineIds.value[idx] = a.leylineId || null
      })
    } catch (err) { console.error('加载灵脉指派失败:', err) }
  }

  async function assignCharacterToLeyline(slotIndex, type) {
    if (!campaignId.value) { alert('请先选择战役'); return }
    const leyId = type === 'SERVANT' ? servantLeylineIds.value[slotIndex] : masterLeylineIds.value[slotIndex]
    const cls = roundInfo.value.classes[slotIndex]
    const card = characterCards.value.find(c => c.cardType === type && normalizeClassName(c.className) === cls)
    if (!card) { alert('未找到对应的角色卡，无法保存指派。请先上传该战役的角色卡。'); return }
    try {
      await upsertLeylineAssignment(campaignId.value, leyId || null, card.id)
    } catch (err) { console.error('保存指派失败:', err); alert('保存指派失败：' + (err.message || err)) }
  }

  async function saveAllAssignments() {
    if (!campaignId.value) { alert('请先选择战役'); return }
    assignmentSaving.value = true
    try {
      const items = []
      roundInfo.value.classes.forEach((cls, idx) => {
        const sCard = characterCards.value.find(c => c.cardType === 'SERVANT' && normalizeClassName(c.className) === cls)
        if (sCard) items.push({ characterCardId: sCard.id, leylineId: servantLeylineIds.value[idx] ?? null })
        const mCard = characterCards.value.find(c => c.cardType === 'MASTER' && normalizeClassName(c.className) === cls)
        if (mCard) items.push({ characterCardId: mCard.id, leylineId: masterLeylineIds.value[idx] ?? null })
      })
      await assignLeylineBulk(campaignId.value, items)
      items.forEach(it => {
        const card = characterCards.value.find(c => c.id === it.characterCardId)
        if (!card) return
        const cls = normalizeClassName(card.className)
        const idx = roundInfo.value.classes.indexOf(cls)
        if (idx === -1) return
        if (card.cardType === 'SERVANT') servantLeylineIds.value[idx] = it.leylineId ?? null
        else if (card.cardType === 'MASTER') masterLeylineIds.value[idx] = it.leylineId ?? null
      })
      await loadLeylines()
      alert('已保存所有指派')
    } catch (err) { console.error('批量保存指派失败:', err); alert('保存失败：' + (err.message || err)) }
    finally { assignmentSaving.value = false }
  }

  return {
    leylines, selectedLeyline, leyLoading,
    servantLeylineIds, masterLeylineIds, assignmentSaving,
    loadLeylines, loadLeylinesForCampaign,
    getCharactersOnLeyline, getSubmissionsOnLeyline,
    loadLeylineAssignments, assignCharacterToLeyline, saveAllAssignments,
    addLeyline, saveLeyline, removeLeyline,
  }
}
