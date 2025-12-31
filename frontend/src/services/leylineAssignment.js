const API_BASE = 'http://localhost:8080/api'
import { request } from './requestUtil'

export async function listLeylineAssignments(campaignId) {
  const params = new URLSearchParams({ campaignId: String(campaignId) })
  return request(`${API_BASE}/leyline-assignments?${params.toString()}`)
}

export async function upsertLeylineAssignment(campaignId, characterCardId, leylineId) {
  return request(`${API_BASE}/leyline-assignments`, {
    method: 'POST',
    body: JSON.stringify({ campaignId, characterCardId, leylineId }),
  })
}

export async function deleteLeylineAssignment(id) {
  return request(`${API_BASE}/leyline-assignments/${id}`, {
    method: 'DELETE',
  })
}


