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
  // 检查响应是否有内容
  const contentType = res.headers.get('content-type');
  const contentLength = res.headers.get('content-length');
  
  // 如果内容长度为0或没有JSON内容类型，返回null
  if (contentLength === '0' || (contentType && !contentType.includes('application/json'))) {
    return null;
  }
  
  // 尝试获取文本内容
  const text = await res.text();
  // 如果文本为空，返回null
  if (!text || text.trim() === '') {
    return null;
  }
  
  // 尝试解析JSON
  try {
    return JSON.parse(text);
  } catch (e) {
    // 如果解析失败，返回null（可能是空响应）
    return null;
  }
}

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

