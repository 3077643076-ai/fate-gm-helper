import { API_BASE } from '../services/requestUtil.js'
import { normalizeClassName } from '../utils/helpers.js'

/**
 * SSE 长连接 — 监听行动提交的实时推送
 */
export function useSSEConnection(campaignId, servantActions, masterActions, roundInfo, characterCards, loadActionSubmissionsFn) {
  // 用闭包变量持有 EventSource 实例，修复原先未声明变量的 bug
  let actionEventSource = null

  function findSlotIndexFromServantClass(servantClass) {
    if (!servantClass) return -1
    const norm = normalizeClassName(servantClass)
    let idx = roundInfo.value.classes.indexOf(norm)
    if (idx !== -1) return idx

    const text = String(servantClass).toLowerCase()
    for (let i = 0; i < roundInfo.value.classes.length; i++) {
      const cls = roundInfo.value.classes[i]
      const card = characterCards.value.find(c => normalizeClassName(c.className) === cls && String(c.className || '').toLowerCase().includes(text))
      if (card) return i
    }
    for (let i = 0; i < roundInfo.value.classes.length; i++) {
      const card = characterCards.value.find(c => String(c.code || '').toLowerCase() === text)
      if (card) {
        const cls = normalizeClassName(card.className)
        const idx2 = roundInfo.value.classes.indexOf(cls)
        if (idx2 !== -1) return idx2
      }
    }
    return -1
  }

  function connectActionSSE() {
    if (!campaignId.value) return
    try {
      if (actionEventSource) {
        try { actionEventSource.close() } catch (e) { /* ignore */ }
        actionEventSource = null
      }
      actionEventSource = new EventSource(`${API_BASE}/action-submissions/stream?campaignId=${campaignId.value}`)
      actionEventSource.addEventListener('submission', (e) => {
        try {
          const obj = JSON.parse(e.data)
          const idx = findSlotIndexFromServantClass(obj.servantClass)
          if (idx === -1) return
          if (obj.actionType === 'SERVANT_ACTION') servantActions.value[idx] = obj.content || ''
          else masterActions.value[idx] = obj.content || ''
        } catch (err) { console.error('处理 submission SSE 失败', err) }
      })
      actionEventSource.addEventListener('connected', () => {
        loadActionSubmissionsFn()
      })
      actionEventSource.onerror = (err) => {
        console.error('行动提交 SSE 错误', err)
      }
    } catch (err) {
      console.error('connectActionSSE failed', err)
    }
  }

  return { connectActionSSE, findSlotIndexFromServantClass }
}
