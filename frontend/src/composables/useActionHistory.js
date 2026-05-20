/**
 * 行动记录表 — 固定表头、行标签、按回合按槽位查找历史行动
 */
export function useActionHistory(historyActions, currentTurn) {
  const actionRecordHeaderClasses = ['剑', '弓', '枪', '骑', '术', '杀', '狂']

  const actionRecordRowLabels = buildActionRecordRowLabels()

  function buildActionRecordRowLabels() {
    const labels = ['跳伞']
    const dayMap = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四']
    for (let d = 1; d <= 14; d++) {
      const dayStr = dayMap[Math.min(d - 1, dayMap.length - 1)]
      labels.push(`第${dayStr}天昼行动`)
      labels.push(`第${dayStr}天夜行动`)
    }
    return labels
  }

  function getHistoryCellForRound(roundNumber, slotIndex) {
    const r = historyActions.value.find(h => Number(h.roundNumber) === Number(roundNumber))
    if (r) {
      if (Array.isArray(r.actionOrder) && r.actionOrder.length > 0) {
        const parts = []
        r.actionOrder.forEach(cat => {
          if (cat && Array.isArray(cat.actions)) {
            const v = cat.actions[slotIndex]
            if (v && String(v).trim()) parts.push(v)
          }
        })
        if (parts.length > 0) return parts.join(' / ')
      }
      const parts = []
      if (Array.isArray(r.servantActions)) {
        const s = r.servantActions[slotIndex]
        if (s && String(s).trim()) parts.push(s)
      }
      if (Array.isArray(r.masterActions)) {
        const m = r.masterActions[slotIndex]
        if (m && String(m).trim()) parts.push(m)
      }
      if (parts.length > 0) return parts.join(' / ')
    }
    return ''
  }

  function getHistoryServantForRound(roundNumber, slotIndex) {
    const r = historyActions.value.find(h => Number(h.roundNumber) === Number(roundNumber))
    if (!r) {
      return Number(roundNumber) <= Number(currentTurn.value) ? '待机' : ''
    }
    if (Array.isArray(r.servantActions)) {
      const v = r.servantActions[slotIndex]
      if (v && String(v).trim()) return v
    }
    return Number(roundNumber) <= Number(currentTurn.value) ? '待机' : ''
  }

  function getHistoryMasterForRound(roundNumber, slotIndex) {
    const r = historyActions.value.find(h => Number(h.roundNumber) === Number(roundNumber))
    if (!r) {
      return Number(roundNumber) <= Number(currentTurn.value) ? '待机' : ''
    }
    if (Array.isArray(r.masterActions)) {
      const v = r.masterActions[slotIndex]
      if (v && String(v).trim()) return v
    }
    return Number(roundNumber) <= Number(currentTurn.value) ? '待机' : ''
  }

  return {
    actionRecordHeaderClasses,
    actionRecordRowLabels,
    getHistoryCellForRound,
    getHistoryServantForRound,
    getHistoryMasterForRound,
  }
}
