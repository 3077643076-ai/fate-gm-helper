import { request, API_BASE } from './requestUtil.js'

export async function listCurrentSubmissions(campaignId) {
  const params = new URLSearchParams({ campaignId: String(campaignId) });
  return request(`${API_BASE}/action-submissions?${params.toString()}`);
}


