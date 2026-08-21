import { API_BASE, request } from './requestUtil'

export async function listCurrentSubmissions(campaignId) {
  const params = new URLSearchParams({ campaignId: String(campaignId) });
  return request(`${API_BASE}/action-submissions?${params.toString()}`);
}


