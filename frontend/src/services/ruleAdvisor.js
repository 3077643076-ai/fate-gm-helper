import { API_BASE, request } from './requestUtil'

// 知识库索引状态
export function kbStatus() {
  return request(`${API_BASE}/kb/status`)
}

// 纯语义检索，返回相关规则块
export function searchKb(q, topK = 6) {
  const params = new URLSearchParams({ q, topK: String(topK) })
  return request(`${API_BASE}/kb/search?${params}`)
}

// AI 判定建议：检索相关规则 + DeepSeek 生成建议
export function adviseKb(question, topK = 6) {
  return request(`${API_BASE}/kb/advise`, {
    method: 'POST',
    body: JSON.stringify({ question, topK }),
  })
}
