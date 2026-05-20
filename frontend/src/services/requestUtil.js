// 后端API基础路径（开发环境通过Vite代理转发到localhost:8080）
export const API_BASE = '/api'

/**
 * 通用HTTP请求封装
 * 自动处理JSON序列化、错误响应、空响应
 */
export async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `请求失败：${res.status}`)
  }
  const contentType = res.headers.get('content-type')
  const contentLength = res.headers.get('content-length')

  // 没有内容体或不是JSON响应
  if (contentLength === '0' || (contentType && !contentType.includes('application/json'))) {
    return null
  }

  const text = await res.text()
  if (!text || text.trim() === '') {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
