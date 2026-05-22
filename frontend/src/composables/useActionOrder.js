import { ref } from 'vue'

function safeNullArray(len) {
  const n = Number(len) || 0
  const arr = []
  for (let i = 0; i < n; i++) arr.push(null)
  return arr
}

/** phaseType 枚举值 → 中文显示名 */
const PHASE_TYPE_MAP = {
  MANEUVER: '机动',
  SOUL_EAT: '魂食',
  INTERFERE: '干涉',
  LIBERATE: '解放',
  CREATE: '制造',
  INTEL: '信息',
  REST: '休整',
  ASSIST: '协助',
  INTERVENE: '介入',
}

export function useActionOrder(campaignId, roundInfo) {
  // 规则书9种结算类别，按结算顺序排列
  const actionOrder = ref([
    { type: '机动', phaseType: 'MANEUVER', actions: ['', '', '', '', '', '', ''] },
    { type: '魂食', phaseType: 'SOUL_EAT', actions: ['', '', '', '', '', '', ''] },
    { type: '干涉', phaseType: 'INTERFERE', actions: ['', '', '', '', '', '', ''] },
    { type: '解放', phaseType: 'LIBERATE', actions: ['', '', '', '', '', '', ''] },
    { type: '制造', phaseType: 'CREATE', actions: ['', '', '', '', '', '', ''] },
    { type: '信息', phaseType: 'INTEL', actions: ['', '', '', '', '', '', ''] },
    { type: '休整', phaseType: 'REST', actions: ['', '', '', '', '', '', ''] },
    { type: '协助', phaseType: 'ASSIST', actions: ['', '', '', '', '', '', ''] },
    { type: '介入', phaseType: 'INTERVENE', actions: ['', '', '', '', '', '', ''] },
  ])

  const servantActions = ref(safeNullArray(roundInfo.value.classes.length))
  const masterActions = ref(safeNullArray(roundInfo.value.classes.length))
  const servantActionPhases = ref(safeNullArray(roundInfo.value.classes.length))
  const masterActionPhases = ref(safeNullArray(roundInfo.value.classes.length))

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
        // 优先使用后端返回的 phaseType，兜底用文本检测
        let cat = null
        // 在 servantActionPhases/masterActionPhases 中查找对应 slot 的 phaseType
        const saPhase = servantActionPhases.value[slot]
        const maPhase = masterActionPhases.value[slot]
        if (saPhase && sa && String(sa).trim() === txt) cat = PHASE_TYPE_MAP[saPhase] || null
        if (!cat && maPhase && ma && String(ma).trim() === txt) cat = PHASE_TYPE_MAP[maPhase] || null
        // 兜底：文本关键词检测
        if (!cat) cat = detectActionCategoryFromText(txt)
        const idx = actionOrder.value.findIndex(a => a.type === cat)
        if (idx === -1) return
        const existing = actionOrder.value[idx].actions[slot] || ''
        actionOrder.value[idx].actions[slot] = existing ? existing + ' / ' + txt : txt
      })
    }
    // 机动行空位补"待机"
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
      const a1 = []; const a2 = []; const p1 = []; const p2 = []
      for (let i = 0; i < len; i++) { a1.push(null); a2.push(null); p1.push(null); p2.push(null) }
      servantActions.value = a1
      masterActions.value = a2
      servantActionPhases.value = p1
      masterActionPhases.value = p2
      ;(res || []).forEach(s => {
        if (s.roundNumber != null && Number(s.roundNumber) !== Number(currentTurn.value)) return
        const idx = findSlotIndexFn(s.servantClass)
        if (idx === -1) return
        if (s.actionType === 'SERVANT_ACTION') {
          servantActions.value[idx] = s.content || ''
          servantActionPhases.value[idx] = s.phaseType || null
        } else {
          masterActions.value[idx] = s.content || ''
          masterActionPhases.value[idx] = s.phaseType || null
        }
      })
      try { applySubmissionsToActionOrder() } catch (e) { console.error('applySubmissionsToActionOrder failed', e) }
    } catch (err) { console.error('加载行动提交失败:', err) }
  }

  // 保留兜底用的文本检测（后端未返回 phaseType 时使用）
  function detectActionCategoryFromText(text) {
    const t = String(text).toLowerCase()
    if (t.includes('移动') || t.includes('机动') || t.includes('逃跑') || t.includes('撤退') || t.includes('追') || t.includes('转移')) return '机动'
    if (t.includes('魂食') || t.includes('捕食') || t.includes('吸收')) return '魂食'
    if (t.includes('攻击') || t.includes('战斗') || t.includes('防御') || t.includes('干涉') || t.includes('阻拦') || t.includes('狙击')) return '干涉'
    if (t.includes('宝具') || t.includes('解放') || t.includes('真名')) return '解放'
    if (t.includes('制造') || t.includes('工坊') || t.includes('礼装') || t.includes('道具') || t.includes('结界')) return '制造'
    if (t.includes('侦察') || t.includes('感知') || t.includes('情报') || t.includes('搜索') || t.includes('观察') || t.includes('信息')) return '信息'
    if (t.includes('休整') || t.includes('恢复') || t.includes('治疗') || t.includes('休息') || t.includes('冥想')) return '休整'
    if (t.includes('协助') || t.includes('支援') || t.includes('帮助') || t.includes('辅佐')) return '协助'
    if (t.includes('介入') || t.includes('参战') || t.includes('加入')) return '介入'
    return '干涉' // 默认归入干涉
  }

  return {
    actionOrder, servantActions, masterActions,
    servantActionPhases, masterActionPhases,
    resetActionOrderActions, detectActionCategoryFromText,
    applySubmissionsToActionOrder, loadActionSubmissions,
  }
}
