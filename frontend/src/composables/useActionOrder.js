import { ref } from 'vue'

function safeNullArray(len) {
  const n = Number(len) || 0
  const arr = []
  for (let i = 0; i < n; i++) arr.push(null)
  return arr
}

/**
 * 检测行动文本属于哪个结算类别
 */
function detectActionCategoryFromText(text) {
  const t = String(text).toLowerCase()
  // 机动类
  if (t.includes('移动') || t.includes('机动') || t.includes('逃跑') || t.includes('撤退') || t.includes('追') || t.includes('转移')) return '机动'
  // 魂食类
  if (t.includes('魂食') || t.includes('捕食') || t.includes('吸收')) return '魂食'
  // 干涉类
  if (t.includes('攻击') || t.includes('战斗') || t.includes('防御') || t.includes('干涉') || t.includes('阻拦') || t.includes('狙击')) return '干涉'
  // 解放类
  if (t.includes('宝具') || t.includes('解放') || t.includes('真名')) return '解放'
  // 制造类
  if (t.includes('制造') || t.includes('工坊') || t.includes('礼装') || t.includes('道具')) return '制造'
  // 信息类
  if (t.includes('侦察') || t.includes('感知') || t.includes('情报') || t.includes('搜索') || t.includes('观察') || t.includes('信息')) return '信息'
  // 休整类
  if (t.includes('休整') || t.includes('恢复') || t.includes('治疗') || t.includes('休息') || t.includes('冥想')) return '休整'
  // 摧毁工房类
  if (t.includes('摧毁') || t.includes('破坏') || t.includes('拆除')) return '摧毁工房'
  // 默认归入干涉
  return '干涉'
}

export function useActionOrder(campaignId, roundInfo) {
  const actionOrder = ref([
    { type: '机动', actions: ['', '', '', '', '', '', ''] },
    { type: '魂食', actions: ['', '', '', '', '', '', ''] },
    { type: '干涉', actions: ['', '', '', '', '', '', ''] },
    { type: '解放', actions: ['', '', '', '', '', '', ''] },
    { type: '制造', actions: ['', '', '', '', '', '', ''] },
    { type: '信息', actions: ['', '', '', '', '', '', ''] },
    { type: '休整', actions: ['', '', '', '', '', '', ''] },
    { type: '摧毁工房', actions: ['', '', '', '', '', '', ''] },
  ])

  const servantActions = ref(safeNullArray(roundInfo.value.classes.length))
  const masterActions = ref(safeNullArray(roundInfo.value.classes.length))

  function resetActionOrderActions() {
    const len = Number(roundInfo.value.classes.length) || 0
    actionOrder.value.forEach(cat => {
      cat.actions = []
      for (let i = 0; i < len; i++) cat.actions.push('')
    })
  }

  function applySubmissionsToActionOrder() {
    const len = Number(roundInfo.value.classes.length) || 0
    resetActionOrderActions()
    for (let slot = 0; slot < len; slot++) {
      const texts = []
      const sa = servantActions.value[slot]
      const ma = masterActions.value[slot]
      if (sa && String(sa).trim()) texts.push(String(sa).trim())
      if (ma && String(ma).trim()) texts.push(String(ma).trim())
      texts.forEach(txt => {
        const cat = detectActionCategoryFromText(txt)
        const idx = actionOrder.value.findIndex(a => a.type === cat)
        if (idx === -1) return
        const existing = actionOrder.value[idx].actions[slot] || ''
        actionOrder.value[idx].actions[slot] = existing ? existing + ' / ' + txt : txt
      })
    }
    // 机动行额外补充
    const mi = actionOrder.value.findIndex(a => a.type === '机动')
    if (mi !== -1) {
      for (let slot = 0; slot < len; slot++) {
        if (!actionOrder.value[mi].actions[slot]) {
          actionOrder.value[mi].actions[slot] = '待机'
        }
      }
    }
  }

  async function loadActionSubmissions(currentTurn, normalizeClassName, characterCards, findSlotIndexFn) {
    if (!campaignId.value) return
    try {
      const { listCurrentSubmissions } = await import('../services/actionSubmission.js')
      const res = await listCurrentSubmissions(campaignId.value)
      const len = Number(roundInfo.value.classes.length) || 0
      const a1 = []; const a2 = []
      for (let i = 0; i < len; i++) { a1.push(null); a2.push(null) }
      servantActions.value = a1
      masterActions.value = a2
      ;(res || []).forEach(s => {
        if (s.roundNumber != null && Number(s.roundNumber) !== Number(currentTurn.value)) return
        const idx = findSlotIndexFn(s.servantClass)
        if (idx === -1) return
        if (s.actionType === 'SERVANT_ACTION') servantActions.value[idx] = s.content || ''
        else masterActions.value[idx] = s.content || ''
      })
      try { applySubmissionsToActionOrder() } catch (e) { console.error('applySubmissionsToActionOrder failed', e) }
    } catch (err) { console.error('加载行动提交失败:', err) }
  }

  return {
    actionOrder, servantActions, masterActions,
    resetActionOrderActions, detectActionCategoryFromText,
    applySubmissionsToActionOrder, loadActionSubmissions,
  }
}
