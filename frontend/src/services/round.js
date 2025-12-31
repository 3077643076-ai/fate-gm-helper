const API_BASE = 'http://localhost:8080/api';

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `请求失败：${res.status}`);
  }
  const contentType = res.headers.get('content-type');
  const contentLength = res.headers.get('content-length');

  if (contentLength === '0' || (contentType && !contentType.includes('application/json'))) {
    return null;
  }

  const text = await res.text();
  if (!text || text.trim() === '') {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

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


