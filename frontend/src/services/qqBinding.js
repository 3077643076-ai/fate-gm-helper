import { API_BASE, request } from './requestUtil'

// 按战役查询所有绑定群（网页端展示用）
export async function listBindingsByCampaign(campaignId) {
  return request(`${API_BASE}/qq-bindings/campaign/${campaignId}`)
}

// 删除（解绑）一条绑定
export async function deleteBinding(id) {
  return request(`${API_BASE}/qq-bindings/${id}`, {
    method: 'DELETE',
  })
}
