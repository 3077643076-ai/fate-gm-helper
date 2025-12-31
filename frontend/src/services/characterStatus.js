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

/**
 * 更新或创建角色状态
 */
export async function updateCharacterStatus(statusData) {
  // 确保statusEffectsList是正确的格式
  if (statusData.statusEffectsList) {
    statusData.statusEffectsList = statusData.statusEffectsList.map(effect => ({
      name: effect.name,
      type: effect.type,
      level: effect.level || 1
    }));
  }

  return request(`${API_BASE}/character-status`, {
    method: 'POST',
    body: JSON.stringify(statusData),
  });
}

/**
 * 获取指定角色卡在指定战役和回合的状态
 */
export async function getCharacterStatus(characterCardId, campaignId, roundNumber) {
  const params = new URLSearchParams({
    characterCardId: characterCardId.toString(),
    campaignId: campaignId.toString(),
    roundNumber: roundNumber.toString(),
  });
  return request(`${API_BASE}/character-status/single?${params.toString()}`);
}

/**
 * 获取指定战役和回合的所有角色状态
 */
export async function getCharacterStatusesByCampaignAndRound(campaignId, roundNumber) {
  const params = new URLSearchParams({
    campaignId: campaignId.toString(),
    roundNumber: roundNumber.toString(),
  });
  return request(`${API_BASE}/character-status/campaign-round?${params.toString()}`);
}

/**
 * 获取指定角色卡在指定战役的所有状态记录
 */
export async function getCharacterStatusHistory(characterCardId, campaignId) {
  const params = new URLSearchParams({
    characterCardId: characterCardId.toString(),
    campaignId: campaignId.toString(),
  });
  return request(`${API_BASE}/character-status/character-campaign?${params.toString()}`);
}
