import { API_BASE, request } from './requestUtil'

export async function listSkillTemplates(page = 0, size = 50, keyword = '', timing = '') {
  const params = new URLSearchParams({
    page: String(page),
    size: String(size),
  });
  if (keyword) params.set('keyword', keyword);
  if (timing) params.set('timing', timing);
  return request(`${API_BASE}/skill-templates?${params.toString()}`);
}

export async function getSkillTemplate(id) {
  return request(`${API_BASE}/skill-templates/${id}`);
}

export async function createSkillTemplate(payload) {
  return request(`${API_BASE}/skill-templates`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateSkillTemplate(id, payload) {
  return request(`${API_BASE}/skill-templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteSkillTemplate(id) {
  return request(`${API_BASE}/skill-templates/${id}`, {
    method: 'DELETE',
  });
}
