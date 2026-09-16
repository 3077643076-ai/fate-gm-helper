// QQ 端口：引擎直连 NapCat 的 OneBot 接口（读公告/发消息/发公告）
// 调用通道自动选择：优先正向 WS（指令机器人维护的连接，实测稳定），
// WS 不可用时回落 HTTP（NapCat 需开 HTTP 服务端，如 http://127.0.0.1:3000）
// 保密说明：群号存 engine_group_binding（本团配置），不入 git

// WS 调用器由 lib/onebot/service.js 启动时注入（见 setWsCaller）
let wsCaller = null

/** 注入 WS 调用器：(action, params) => Promise<data> */
export function setWsCaller(fn) {
  wsCaller = fn
}

/** 调用 OneBot 接口：WS 优先，失败回落 HTTP。返回 data 部分 */
export async function callNapcat(base, action, params) {
  if (wsCaller) {
    try {
      return await wsCaller(action, params ?? {})
    } catch (e) {
      // 静音拦截 / NapCat 已响应的业务失败：直接上抛，不回落 HTTP
      if (e.muted || e.fromNapcat) throw e
      console.error(`[qqport] WS 调用 ${action} 失败，回落 HTTP: ${e.message}`)
    }
  }
  return await callNapcatHttp(base, action, params)
}

/** HTTP 方式调用 OneBot（POST /<action>），返回 data 部分 */
export async function callNapcatHttp(base, action, params) {
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

// ---------- 公告分类：区分"行动公告"和"状态记录公告" ----------
// 规则来自三国杯真实公告格式（2026-09-16 实测）：
//   行动公告：时段开头（第二日昼 / day2昼 / 第二天夜）+ 从者：/御主：/英灵：行动条目，
//             或 .确认行动 生成的"本回合行动确认"格式
//   状态记录：GM 用公告栏记单位状态——"状态记录·更正"标题、"魔力池 185/270"、
//             "魔力 80/110｜持有：…"等；特征是魔力数值对和"常补/持有"

/** 是否行动公告：时段标记 + 行动条目特征（两者同时出现才算，避免状态公告误判） */
export function isActionNoticeText(text) {
  const t = String(text || '')
  if (/本回合行动确认|行动确认/.test(t)) return true
  // 时段标记：第X天/dayX（"天"或"日"），后跟昼/夜——允许中间有空格换行（如"第二日 昼"）
  const hasPeriod = /[一二三四五六七八九十\d]+\s*[天日]\s*[昼夜]|day\s*\d+\s*[昼夜]/i.test(t)
  // 行动条目：从者/御主/英灵 + 冒号；或 + 空格直接跟内容（如"从者 干涉灵脉 许都"），
  // "从者代号/御主代号"是状态记录格式，不算
  const hasColonEntry = /(从者|御主|英灵)\s*[:：]/.test(t)
  const hasSpaceEntry = /(从者|御主|英灵)\s+(?!代号)\S/.test(t)
  const hasEntry = hasColonEntry || hasSpaceEntry
  if (hasPeriod && hasEntry) return true
  // 兜底：带冒号的条目（旧格式"御主:长坂坡征兵"）单独也算
  if (hasColonEntry) return true
  return false
}

/** 是否状态记录公告：魔力数值对/状态记录标题/常补/持有 */
export function isStatusNoticeText(text) {
  const t = String(text || '')
  if (/状态记录/.test(t)) return true
  if (/魔力\s*\d+\s*\/\s*\d+/.test(t)) return true
  if (/魔力池/.test(t)) return true
  return false
}

/** 从公告列表（最新在前）里挑最新的行动公告；没有返回 null */
export function pickActionNotice(notices) {
  const arr = Array.isArray(notices) ? notices : []
  return arr.find(n => isActionNoticeText(n.text)) ?? null
}

/** 从公告列表里挑最新的状态记录公告；没有返回 null */
export function pickStatusNotice(notices) {
  const arr = Array.isArray(notices) ? notices : []
  return arr.find(n => isStatusNoticeText(n.text) && !isActionNoticeText(n.text)) ?? null
}

// ---------- 公告读取 ----------

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
