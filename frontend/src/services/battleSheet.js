import { API_BASE, request } from './requestUtil'

export async function getOrCreateBattleSheet(campaignId, roundId) {
  const params = new URLSearchParams({
    campaignId: String(campaignId),
    roundId: String(roundId),
  });
  return request(`${API_BASE}/battle-sheets?${params.toString()}`);
}

export async function updateBattleSheet(id, payload) {
  return request(`${API_BASE}/battle-sheets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteBattleSheet(id) {
  return request(`${API_BASE}/battle-sheets/${id}`, {
    method: 'DELETE',
  });
}

export async function saveBattleReviewSnapshot(id, payload) {
  return request(`${API_BASE}/battle-sheets/${id}/snapshot`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listBattleReviewSnapshots(campaignId, roundId = null) {
  const params = new URLSearchParams({ campaignId: String(campaignId) });
  if (roundId) params.set('roundId', String(roundId));
  return request(`${API_BASE}/battle-sheets/snapshots?${params.toString()}`);
}
