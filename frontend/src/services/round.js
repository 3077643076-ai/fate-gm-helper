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

// 全部回合列表（含状态）——"收回合"下拉用
export async function listAllRounds(campaignId) {
  const params = new URLSearchParams({ campaignId: String(campaignId) });
  return request(`${API_BASE}/rounds/list?${params.toString()}`);
}

// 回合序号 → 昼夜标签：turn1=降临日；偶数=第N天昼，奇数=第N天夜
// （2=第1天昼 3=第1天夜 4=第2天昼 5=第2天夜 …）
export function roundLabel(turnNumber) {
  const n = Number(turnNumber)
  if (!Number.isInteger(n) || n <= 0) return '—'
  if (n === 1) return '降临日'
  const day = Math.ceil((n - 1) / 2)
  const period = n % 2 === 0 ? '昼' : '夜'
  return `第${day}天${period}`
}

// 回合序号 → 引擎 phase（昼/夜）
export function roundPhase(turnNumber) {
  const n = Number(turnNumber)
  if (n % 2 === 0) return '昼'
  return '夜'
}

export async function createNextRound(campaignId) {
  const params = new URLSearchParams({ campaignId: String(campaignId) });
  return request(`${API_BASE}/rounds/next?${params.toString()}`, {
    method: 'POST',
  });
}


