import { reactive } from 'vue'

/**
 * 通用的防抖自动保存机制
 * 用于魔力、令咒、异常状态等需要延迟保存的输入字段
 *
 * saveIndicators 使用 reactive 普通对象（而非 Map），
 * 因为模板中用方括号语法 saveIndicators[key] 访问
 */
export function useAutoSave(delay = 2000) {
  const autoSaveStates = new Map()
  const saveIndicators = reactive({})

  function setIndicator(fieldKey, status) {
    if (status === null || status === undefined) {
      delete saveIndicators[fieldKey]
    } else {
      saveIndicators[fieldKey] = status
    }
  }

  function scheduleAutoSave(fieldKey, saveFn) {
    const existing = autoSaveStates.get(fieldKey)
    if (existing && existing.timer) {
      clearTimeout(existing.timer)
    }
    // 立即显示"保存中"指示
    setIndicator(fieldKey, 'saving')
    const timer = setTimeout(async () => {
      try {
        await saveFn()
        setIndicator(fieldKey, 'saved')
        setTimeout(() => {
          setIndicator(fieldKey, null)
        }, 1500)
      } catch (err) {
        console.error(`自动保存失败 [${fieldKey}]:`, err)
        setIndicator(fieldKey, 'error')
      } finally {
        autoSaveStates.delete(fieldKey)
      }
    }, delay)
    autoSaveStates.set(fieldKey, { timer, saveFn })
  }

  function cancelScheduled(fieldKey) {
    const existing = autoSaveStates.get(fieldKey)
    if (existing && existing.timer) {
      clearTimeout(existing.timer)
      autoSaveStates.delete(fieldKey)
    }
  }

  function cancelAll() {
    for (const [key, state] of autoSaveStates) {
      if (state.timer) clearTimeout(state.timer)
    }
    autoSaveStates.clear()
  }

  return { scheduleAutoSave, saveIndicators, cancelScheduled, cancelAll }
}
