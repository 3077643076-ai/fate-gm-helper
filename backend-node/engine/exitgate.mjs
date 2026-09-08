// 出口闸（v0.5 AI 助手的程序级保险）：AI 发出去的每一条消息都先过这里
// 规则（代码强制，不靠提示词）：
//   1. AI 只准往"私组"发消息/改公告——目标渠道不是私组直接拦下
//   2. 文本里出现角色真名（角色卡代号/单位注册表的 code）→ 确定性替换成单位键（弓从/枪御…）
//      依据：真名猜测是核心机制（规则书 3.5.4），真名泄露=敌方白拿情报；GM 也不该再手动翻译
// 替换依据的数据源：unit_registry（单位键↔code）+ character_card（card_id↔code 兜底）

/**
 * 加载本战役的"真名 → 单位键"替换词典
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {number} campaignId
 * @returns {{entries: Array<{name: string, unitKey: string}>}}
 */
export function loadGateLexicon(db, campaignId) {
  const rows = db.prepare(`
    SELECT u.unit_key AS unitKey, u.code AS regCode, c.code AS cardCode
    FROM unit_registry u
    LEFT JOIN character_card c
      ON c.id = u.card_id AND (c.campaign_id = ? OR c.campaign_id IS NULL)
    WHERE u.code IS NOT NULL OR u.card_id IS NOT NULL
  `).all(campaignId)
  const map = new Map()
  const put = (name, unitKey) => {
    const key = String(name ?? '').trim()
    // 少于 2 个字的名字不替换（避免"弓"这类单字误伤正常用语）
    if (!key || key.length < 2 || !unitKey) return
    if (!map.has(key)) map.set(key, unitKey)
  }
  for (const r of rows) {
    if (r.regCode) put(r.regCode, r.unitKey)
    if (r.cardCode) put(r.cardCode, r.unitKey)
  }
  // 名字长的先替换，防止短名先替掉长名的一部分（如"张角"vs"张角改"）
  const entries = [...map.entries()]
    .map(([name, unitKey]) => ({ name, unitKey }))
    .sort((a, b) => b.name.length - a.name.length)
  return { entries }
}

/**
 * 外发文本安检
 * @returns {{blocked: boolean, text: string, hits: Array<{from: string, to: string}>, reason: string}}
 */
export function screenOutbound(db, campaignId, text, targetKind = 'private') {
  const raw = String(text ?? '')
  // 规则 1：渠道白名单——v0.5 AI 只准私组（灵脉群/公屏一律不放行）
  if (targetKind !== 'private') {
    return { blocked: true, text: raw, hits: [], reason: `目标渠道"${targetKind}"不是私组，出口闸拦截` }
  }
  // 规则 2：真名替换
  const { entries } = loadGateLexicon(db, campaignId)
  const hits = []
  let out = raw
  for (const { name, unitKey } of entries) {
    if (!out.includes(name)) continue
    out = out.split(name).join(unitKey)
    hits.push({ from: name, to: unitKey })
  }
  return { blocked: false, text: out, hits, reason: hits.length ? '已替换真名为单位键' : '' }
}
