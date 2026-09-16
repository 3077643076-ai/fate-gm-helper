// 引擎 API 封装（/api/engine/*）：战役 tab 各页面用的结算/裁决/公告能力
import { API_BASE, request } from './requestUtil'

// 引擎一屏状态：单位位置/生效效果/已登记行动/需裁决/判定单
export function getEngineStatus(campaignId, params = {}) {
  const q = new URLSearchParams({ campaignId: String(campaignId) })
  if (params.round) q.set('round', String(params.round))
  if (params.phase) q.set('phase', params.phase)
  return request(`${API_BASE}/engine/status?${q.toString()}`)
}

// 登记行动：文本 → 多行动解析入库（失败片段进需裁决）
export function registerEngineAction(payload) {
  return request(`${API_BASE}/engine/actions`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// 推进时段：前置检查 → 结算 → 报告（失败返回 409 + 原因）
export function advanceEngine(campaignId, payload = {}) {
  return request(`${API_BASE}/engine/advance`, {
    method: 'POST',
    body: JSON.stringify({ campaignId, ...payload }),
  })
}

// 需裁决队列（open 状态）
export function listRulings(campaignId) {
  return request(`${API_BASE}/engine/rulings?campaignId=${campaignId}`)
}

// 职阶群玩家（把"哪个职阶是谁"查出来）：{ players: { 剑: { groupName, members:[{qq,name}] } }, botOnline }
// 数据源是机器人所在职阶群的成员列表，机器人没上线时 members 为空
export function listUnitPlayers(campaignId) {
  return request(`${API_BASE}/engine/players?campaignId=${campaignId}`)
}

// 裁决：填结论关闭一项
export function resolveRuling(id, resolution) {
  return request(`${API_BASE}/engine/rulings/resolve`, {
    method: 'POST',
    body: JSON.stringify({ id, resolution }),
  })
}

// AI 一键收行动（读公告 → 标准化 → 登记 → 回执 → 催未交）
// round=回合序号（turn_number），phase 按回合推（昼/夜）；都传时覆盖公告头里的时段
export function runAgentCollect(campaignId, round, phase) {
  return request(`${API_BASE}/engine/agent/run`, {
    method: 'POST',
    body: JSON.stringify({ campaignId, round, phase }),
  })
}

// AI 助手配置（里面有 napcatHttpBase，公告检查/催交要用）
export function getAgentConfig() {
  return request(`${API_BASE}/engine/agent/config`)
}

// 公告检查：读各私组公告，标出未交行动的组；expectedTurn=正在收的回合（时段对齐用）
export function checkNotices(campaignId, napcatBase, expectedTurn) {
  return request(`${API_BASE}/engine/notices/check`, {
    method: 'POST',
    body: JSON.stringify({ campaignId, napcatBase, expectedTurn }),
  })
}

// 一键催交：向未交行动的私组发提醒
export function remindGroups(campaignId, napcatBase, groups, extra = {}) {
  return request(`${API_BASE}/engine/notices/remind`, {
    method: 'POST',
    body: JSON.stringify({ campaignId, napcatBase, groups, ...extra }),
  })
}

// ---------- 群映射 ----------

// 已登记的群映射列表
export function listGroupBindings(campaignId) {
  return request(`${API_BASE}/engine/groups?campaignId=${campaignId}`)
}

// 从机器人所在群 + 历史消息自动识别候选群
export function autoDetectGroups(campaignId) {
  return request(`${API_BASE}/engine/groups/auto-detect?campaignId=${campaignId}`)
}

// 批量写入群映射
export function saveGroupBindings(campaignId, items) {
  return request(`${API_BASE}/engine/groups/bulk`, {
    method: 'POST',
    body: JSON.stringify({ campaignId, items }),
  })
}

// 删除一条群映射
export function deleteGroupBinding(id) {
  return request(`${API_BASE}/engine/groups/${id}`, { method: 'DELETE' })
}
