import { API_BASE, request } from './requestUtil'

export async function closeCurrentRound(campaignId, snapshot = null) {
  const params = new URLSearchParams({ campaignId: String(campaignId) });
  return request(`${API_BASE}/rounds/close-current?${params.toString()}`, {
    method: 'POST',
    body: snapshot ? JSON.stringify(snapshot) : undefined,
  });
}

export async function listRoundHistory(campaignId) {
  const params = new URLSearchParams({ campaignId: String(campaignId) });
  return request(`${API_BASE}/rounds/history?${params.toString()}`);
}

export async function getCurrentRound(campaignId) {
  const params = new URLSearchParams({ campaignId: String(campaignId) });
  return request(`${API_BASE}/rounds/current?${params.toString()}`);
}

export async function createNextRound(campaignId) {
  const params = new URLSearchParams({ campaignId: String(campaignId) });
  return request(`${API_BASE}/rounds/next?${params.toString()}`, {
    method: 'POST',
  });
}


