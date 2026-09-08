// 提取群公告卡片 v2：base64 解码正文 + prompt 摘要
import { readFileSync } from 'node:fs'

const path = process.env.TEMP + '\\opencode\\sanguo\\群聊记录-三国杯.jsonl'
const recs = readFileSync(path, 'utf8').split('\n').filter(l => l.trim())
  .map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)

const b64 = s => { try { return Buffer.from(s, 'base64').toString('utf8') } catch { return s } }
const decodeEntities = s => String(s ?? '').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d))).replace(/&amp;/g, '&')

let count = 0
for (const r of recs) {
  const t = r.text ?? ''
  if (!t.includes('com.tencent.mannounce')) continue
  count++
  const m = t.match(/data="([^"]*)"/)
  let body = '（解析失败）'
  if (m) {
    try {
      const json = JSON.parse(decodeEntities(m[1]))
      const nn = json?.meta?.mannounce
      if (nn) {
        const title = b64(nn.title ?? '')
        const text = b64(nn.text ?? '').replace(/\n/g, ' | ')
        body = `《${title}》 ${text}`
      } else if (json.prompt) {
        body = json.prompt
      }
    } catch (e) { body = '解析失败 ' + e.message.slice(0, 40) }
  }
  console.log(`[${(r.ts ?? '').slice(5, 16)} ${r.groupName || r.guildId}] ${body.slice(0, 180)}`)
}
console.log(`\n共 ${count} 张公告卡片`)
