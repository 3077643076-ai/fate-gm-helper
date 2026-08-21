export const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// 统一解析后端错误，避免页面直接显示 {"error":"..."} 这种 JSON 字符串。
function getErrorMessage(text, status) {
  if (!text || text.trim() === '') return `请求失败：${status}`

  try {
    const data = JSON.parse(text)
    return data?.error || data?.message || text
  } catch {
    return text
  }
}

export async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(getErrorMessage(text, res.status))
  }

  const contentType = res.headers.get('content-type')
  const contentLength = res.headers.get('content-length')
  if (contentLength === '0' || (contentType && !contentType.includes('application/json'))) {
    return null
  }

  const text = await res.text()
  if (!text || text.trim() === '') return null

  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
