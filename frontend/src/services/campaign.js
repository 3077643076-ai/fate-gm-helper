import { API_BASE, request } from './requestUtil'

export async function listCampaigns() {
  return request(`${API_BASE}/campaigns`);
}

export async function createCampaign(name, description) {
  return request(`${API_BASE}/campaigns`, {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  });
}

export async function deleteCampaign(id) {
  return request(`${API_BASE}/campaigns/${id}`, {
    method: 'DELETE',
  });
}

export async function selectCampaign(id) {
  return request(`${API_BASE}/campaigns/${id}/select`, {
    method: 'POST',
  });
}

export async function getSelectedCampaign() {
  return request(`${API_BASE}/campaigns/selected`);
}

