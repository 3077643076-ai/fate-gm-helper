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
  // 兼容无内容响应（如 DELETE 等），避免 JSON 解析错误
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

