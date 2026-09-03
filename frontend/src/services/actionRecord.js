import { API_BASE, request } from './requestUtil'

// 列出战役的全部手动行动记录（行动表工作流）
export async function listActionRecords(campaignId) {
  const params = new URLSearchParams({ campaignId: String(campaignId) })
  return request(`${API_BASE}/action-records?${params.toString()}`)
}

// 批量保存行动记录格子（内容为空 = 删除该格，回退到历史快照）
export async function saveActionRecords(campaignId, records) {
  return request(`${API_BASE}/action-records`, {
    method: 'PUT',
    body: JSON.stringify({ campaignId: Number(campaignId), records }),
  })
}
