// 隐私层：页面显示统一走 scrub()——真名（卡表 code）替换成单位键（弓从/枪御…）
//   词典来自 GET /api/engine/privacy/lexicon（与 QQ 出口闸同一份，长名优先替换）
//   privacy.enabled 默认 true（全部代号）；设置页可临时开「显示真名」，离开设置页自动关回
import { reactive } from 'vue'

export const privacy = reactive({ hideRealNames: true, loaded: false, entries: [] })

export async function loadLexicon() {
  if (privacy.loaded) return
  try {
    const r = await fetch('/api/engine/privacy/lexicon')
    const b = await r.json()
    privacy.entries = b.entries ?? []
    privacy.loaded = true
  } catch { /* 词典拉不到就原样显示（本地开发兜底） */ }
}

/** 显示前替换：真名 → 单位键；hideRealNames=false（设置页临时开）时原样返回 */
export function scrub(text) {
  const s = String(text ?? '')
  if (!s || !privacy.hideRealNames || !privacy.entries.length) return s
  let out = s
  for (const e of privacy.entries) {
    if (out.includes(e.name)) out = out.split(e.name).join(e.unitKey)
  }
  return out
}

/** 名字列的显示值：替换后若与单位键相同（说明这就是真名本体），回退成 —，避免「术从（术从）」 */
export function scrubName(name, unitKey) {
  const s = scrub(name)
  if (unitKey && s === unitKey) return '—'
  return s
}
