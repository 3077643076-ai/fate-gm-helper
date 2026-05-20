import { ref, watch } from 'vue'

/**
 * 创建一个会自动同步到 localStorage 的响应式变量
 *
 * 页面刷新后自动从 localStorage 恢复上次的值，
 * 值变化时自动写回 localStorage。
 *
 * @param {string} key - localStorage 存储的键名（建议用 'app:xxx' 格式避免冲突）
 * @param {*} defaultValue - 当 localStorage 中没有值时的默认值
 * @returns {import('vue').Ref}
 *
 * 用法示例：
 *   const campaignId = usePersistedRef('battle-sheet:campaignId', null)
 */
export function usePersistedRef(key, defaultValue) {
  // 从 localStorage 读取已保存的值
  let storedValue
  try {
    const raw = localStorage.getItem(key)
    if (raw !== null) {
      storedValue = JSON.parse(raw)
    }
  } catch {
    // 如果读取或解析失败（比如旧数据格式不对），丢弃
    storedValue = undefined
  }

  // 如果能读到有效值就用它，否则用默认值
  const initialValue = storedValue !== undefined ? storedValue : defaultValue
  const state = ref(initialValue)

  // 监听变化，自动写入 localStorage
  watch(
    state,
    (newVal) => {
      try {
        if (newVal === null || newVal === undefined) {
          localStorage.removeItem(key)
        } else {
          localStorage.setItem(key, JSON.stringify(newVal))
        }
      } catch {
        // localStorage 写入失败（比如隐私模式或配额满），静默忽略
      }
    },
    { deep: true }
  )

  return state
}
