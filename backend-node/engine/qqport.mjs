// QQ 端口：引擎直连 NapCat 的 OneBot HTTP 接口（读公告/发消息/发公告）
// 前提：NapCat 开启 HTTP Server（如监听 127.0.0.1:3000）；地址由调用方传入
// 保密说明：群号存 engine_group_binding（本团配置），不入 git

/** 调用 OneBot HTTP API（POST /<action>），返回 data 部分 */
export async function callNapcat(base, action, params) {
  const url = `${String(base ?? '').replace(/\/$/, '')}/${action}`
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params ?? {}),
  })
  if (r.status === 404) throw new Error(`NapCat 无 ${action} 接口（确认 HTTP 服务已开启且 NapCat 版本支持）`)
  if (!r.ok) throw new Error(`NapCat HTTP ${r.status}`)
  const body = await r.json()
  // OneBot 响应：{ status, retcode, data }；retcode 0=成功，1=异步（视为已提交）
  if (body.retcode !== undefined && body.retcode !== 0 && body.retcode !== 1) {
    throw new Error(body.message ?? body.wording ?? `retcode ${body.retcode}`)
  }
  return body.data ?? body
}

/** HTML 实体解码（NapCat 公告正文常带 &quot; 等转义，与 fate-actions 同款处理） */
export function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

/** 从公告对象取正文文本（兼容 message 为对象/字符串、content 字段等形态） */
export function noticeText(n) {
  const m = n?.message
  if (m && typeof m === 'object' && m.text != null) return String(m.text)
  if (typeof m === 'string') return m
  if (n?.content) return String(n.content)
  return ''
}

/**
 * 拉取单个群的公告列表（最新在前），返回 [{ text, pubTime }]（已解码）
 */
export async function fetchGroupNotices(base, groupId) {
  const data = await callNapcat(base, '_get_group_notice', { group_id: groupId })
  const arr = Array.isArray(data) ? data : []
  return arr.map(n => ({
    text: decodeEntities(noticeText(n)),
    pubTime: n?.publish_time ? new Date(n.publish_time * 1000).toISOString().slice(0, 16) : '',
  }))
}

/** 发群消息 */
export async function sendGroupMsg(base, groupId, message) {
  return callNapcat(base, 'send_group_msg', { group_id: groupId, message: String(message) })
}

/** 发群公告 */
export async function sendGroupNotice(base, groupId, content) {
  return callNapcat(base, '_send_group_notice', { group_id: groupId, content: String(content) })
}
