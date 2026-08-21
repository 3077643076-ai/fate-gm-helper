import { API_BASE, request } from './requestUtil'

export async function createCharacterCard(payload) {
  return request(`${API_BASE}/character-cards`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getCharacterCard(id) {
  return request(`${API_BASE}/character-cards/${id}`);
}

export async function listCharacterCards(page = 0, size = 20, keyword = null, campaignId = null) {
  const params = new URLSearchParams({ page: page.toString(), size: size.toString() });
  if (keyword && keyword.trim()) {
    params.append('keyword', keyword.trim());
  }
  if (campaignId) {
    params.append('campaignId', campaignId.toString());
  }
  return request(`${API_BASE}/character-cards?${params.toString()}`);
}

export async function deleteCharacterCard(id) {
  return request(`${API_BASE}/character-cards/${id}`, {
    method: 'DELETE',
  });
}

export async function retireCharacterCard(id) {
  return request(`${API_BASE}/character-cards/${id}/retire`, {
    method: 'PUT',
  });
}

export async function unretireCharacterCard(id) {
  return request(`${API_BASE}/character-cards/${id}/unretire`, {
    method: 'PUT',
  });
}

// 战役相关API已移至 campaign.js

