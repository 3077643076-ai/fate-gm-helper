import { ref, computed } from 'vue'
import { closeCurrentRound, createNextRound, listRoundHistory } from '../services/round'

/**
 * 回合管理 — 回合标签、进度百分比、关闭行动提交、进入下一回合、加载历史
 */
export function useRoundManager(campaignId, roundInfo, currentTurn, totalTurns, characterStatuses, actionOrder, servantActions, masterActions, { loadCharacterStatuses, resetActionOrderActions }) {
  const historyActions = ref([])

  const currentTurnLabel = computed(() => {
    const turn = currentTurn.value
    if (turn <= 1) return '降临日'
    const k = turn - 2
    const day = Math.floor(k / 2) + 1
    const isDay = k % 2 === 0
    const dayMap = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四']
    const dayStr = dayMap[Math.min(day - 1, dayMap.length - 1)]
    return `第${dayStr}日${isDay ? '昼' : '夜'}`
  })

  const progressPercent = computed(() => {
    return Math.round((currentTurn.value / totalTurns.value) * 100)
  })

  async function loadHistory() {
    if (!campaignId.value) {
      historyActions.value = []
      return
    }
    try {
      const res = await listRoundHistory(campaignId.value)
      historyActions.value = res || []
    } catch (e) {
      console.error('加载历史记录失败:', e)
      historyActions.value = []
    }
  }

  async function closeActions() {
    if (!campaignId.value) {
      alert('请先选择一个战役')
      return
    }
    try {
      const payload = {
        actionOrder: JSON.parse(JSON.stringify(actionOrder.value || [])),
        servantActions: JSON.parse(JSON.stringify(servantActions.value || [])),
        masterActions: JSON.parse(JSON.stringify(masterActions.value || [])),
      }
      await closeCurrentRound(campaignId.value, payload)
      try {
        const history = await listRoundHistory(campaignId.value)
        historyActions.value = history || []
      } catch (e) {
        console.error('刷新历史记录失败', e)
      }
      servantActions.value = new Array(roundInfo.value.classes.length).fill(null)
      masterActions.value = new Array(roundInfo.value.classes.length).fill(null)
      resetActionOrderActions()
      alert('已关闭当前回合的行动提交；历史记录已保存')
    } catch (err) {
      alert('关闭失败: ' + err.message)
    }
  }

  async function nextTurn() {
    if (currentTurn.value >= totalTurns.value) {
      alert('战役已结束')
      return
    }
    if (!campaignId.value) {
      alert('请先选择战役')
      return
    }
    try {
      const res = await createNextRound(campaignId.value)
      if (res && res.round && res.round.turnNumber != null) {
        currentTurn.value = Number(res.round.turnNumber)
        servantActions.value = new Array(roundInfo.value.classes.length).fill(null)
        masterActions.value = new Array(roundInfo.value.classes.length).fill(null)
        resetActionOrderActions()
        await loadCharacterStatuses()
        alert(`进入第 ${currentTurn.value} 回合`)
      } else {
        alert('进入下一回合失败：服务器未返回回合信息')
      }
    } catch (err) {
      alert('进入下一回合失败: ' + err.message)
    }
  }

  return {
    historyActions,
    currentTurnLabel,
    progressPercent,
    loadHistory,
    closeActions,
    nextTurn,
  }
}
