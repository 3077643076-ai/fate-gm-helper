import { request, API_BASE } from './requestUtil.js'

/** 获取战役下全部契约 */
export async function listContracts(campaignId) {
  const params = new URLSearchParams({ campaignId: String(campaignId) })
  return request(`${API_BASE}/contracts?${params.toString()}`)
}

/** 创建契约 */
export async function createContract(campaignId, contractType, initiatorCardId, signatoryCardId, terms) {
  return request(`${API_BASE}/contracts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaignId, contractType, initiatorCardId, signatoryCardId, terms }),
  })
}

/** 破除契约 */
export async function breakContract(contractId) {
  return request(`${API_BASE}/contracts/${contractId}`, { method: 'DELETE' })
}
