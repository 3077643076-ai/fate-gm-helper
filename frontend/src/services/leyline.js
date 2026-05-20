import { request, API_BASE } from './requestUtil.js'

export async function listLeylines(campaignId) {
  const params = new URLSearchParams({ campaignId: String(campaignId) });
  return request(`${API_BASE}/leylines?${params.toString()}`);
}

export async function createLeyline(campaignId, name, manaAmount, battlefieldWidth, populationFlow, effect = '', description = '') {
  return request(`${API_BASE}/leylines`, {
    method: 'POST',
    body: JSON.stringify({ campaignId, name, manaAmount, battlefieldWidth, populationFlow, effect, description }),
  });
}

export async function updateLeyline(id, campaignId, name, manaAmount, battlefieldWidth, populationFlow, effect = '', description = '') {
  return request(`${API_BASE}/leylines/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ campaignId, name, manaAmount, battlefieldWidth, populationFlow, effect, description }),
  });
}

export async function listLeylineAssignments(campaignId) {
  const params = new URLSearchParams({ campaignId: String(campaignId) });
  return request(`${API_BASE}/leyline-assignments?${params.toString()}`);
}

export async function upsertLeylineAssignment(campaignId, leylineId, characterCardId) {
  return request(`${API_BASE}/leyline-assignments`, {
    method: 'POST',
    body: JSON.stringify({ campaignId, leylineId, characterCardId }),
  });
}

export async function assignLeylineBulk(campaignId, items) {
  return request(`${API_BASE}/leyline-assignments/bulk`, {
    method: 'POST',
    body: JSON.stringify({ campaignId, items }),
  });
}

export async function deleteLeyline(id) {
  return request(`${API_BASE}/leylines/${id}`, {
    method: 'DELETE',
  });
}


