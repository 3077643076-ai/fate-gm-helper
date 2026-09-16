// 技能提交收集相关接口封装
import { API_BASE, request } from './requestUtil'

// 试解析（不落库）：返回 { items, unknownShards }
export async function previewSubmission(campaignId, text) {
  return request(`${API_BASE}/skill-submissions/preview`, {
    method: 'POST',
    body: JSON.stringify({ campaignId, text }),
  });
}

// 提交入库（pending 待确认）
export async function createSubmission(campaignId, text, extra = {}) {
  return request(`${API_BASE}/skill-submissions`, {
    method: 'POST',
    body: JSON.stringify({ campaignId, text, ...extra }),
  });
}

// 列表：status 传 'pending' 只看待确认
export async function listSubmissions(campaignId, status = '') {
  const params = new URLSearchParams({ campaignId: String(campaignId) });
  if (status) params.set('status', status);
  return request(`${API_BASE}/skill-submissions?${params.toString()}`);
}

// GM 修正条目（换模板 / 改段勾选 / 改等级）
export async function updateSubmissionItems(id, items) {
  return request(`${API_BASE}/skill-submissions/${id}/items`, {
    method: 'PUT',
    body: JSON.stringify({ items }),
  });
}

// 确认（可带修正后的 items 和要沉淀的别名）
export async function confirmSubmission(id, items, saveAliases = []) {
  return request(`${API_BASE}/skill-submissions/${id}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ items, saveAliases }),
  });
}

// 丢弃
export async function discardSubmission(id) {
  return request(`${API_BASE}/skill-submissions/${id}/discard`, { method: 'POST' });
}

// 删除记录
export async function deleteSubmission(id) {
  return request(`${API_BASE}/skill-submissions/${id}`, { method: 'DELETE' });
}

// 别名列表（全局 + 战役专属）
export async function listSkillAliases(campaignId) {
  return request(`${API_BASE}/skill-aliases?campaignId=${campaignId}`);
}

// 新增/覆盖别名
export async function createSkillAlias(aliasText, templateId, campaignId) {
  return request(`${API_BASE}/skill-aliases`, {
    method: 'POST',
    body: JSON.stringify({ aliasText, templateId, campaignId }),
  });
}

// 删除别名
export async function deleteSkillAlias(id) {
  return request(`${API_BASE}/skill-aliases/${id}`, { method: 'DELETE' });
}
