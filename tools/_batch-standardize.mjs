// 批量标准化验证：把群聊记录里提取的 25 条真实公告 → 标准行动单
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { standardizeAnnouncement } from '../backend-node/engine/parser.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const db = new DatabaseSync(join(root, 'backend-node', 'data', 'gm_helper.db'))

const path = process.env.TEMP + '\\opencode\\sanguo\\群聊记录-三国杯.jsonl'
const recs = readFileSync(path, 'utf8').split('\n').filter(l => l.trim())
  .map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)

const b64 = s => { try { return Buffer.from(s, 'base64').toString('utf8') } catch { return s } }
const decodeEntities = s => String(s ?? '').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d))).replace(/&amp;/g, '&')

// 从卡片推断单位与时段（群名→职阶组；公告文本里的时段词）
function inferUnit(groupName) {
  const map = { 弓: '弓从', 杀: '杀从', 骑: '骑从', 枪: '枪从', 剑: '剑从', 术: '术从', 狂: '狂从' }
  for (const [k, v] of Object.entries(map)) if ((groupName ?? '').includes(k)) return v
  return '弓从'
}
function inferPhase(text) {
  const t = String(text ?? '')
  if (/夜|晚上/.test(t)) return '夜'
  return '昼'
}

let total = 0, okLines = 0, failLines = 0
for (const r of recs) {
  const t = r.text ?? ''
  if (!t.includes('com.tencent.mannounce')) continue
  const m = t.match(/data="([^"]*)"/)
  if (!m) continue
  let noticeText = ''
  try {
    const json = JSON.parse(decodeEntities(m[1]))
    const nn = json?.meta?.mannounce
    if (nn) noticeText = b64(nn.text ?? '')
    else if (json.prompt) noticeText = String(json.prompt).replace(/^\[群公告\]/, '')
  } catch { continue }
  if (!noticeText.trim()) continue

  const unit = inferUnit(r.groupName)
  // 跳过状态记录/持有物类公告（非行动）
  if (/状态记录|持有|自带/.test(noticeText)) continue

  console.log(`\n【${(r.ts ?? '').slice(5, 16)} ${r.groupName}】原文: ${noticeText.replace(/\n/g, ' | ').slice(0, 100)}`)
  const phase = inferPhase(noticeText)
  const roundMatch = noticeText.match(/第?\s*([一二三四五六七八九1-9]+)\s*[天日]/)
  const round = roundMatch ? (['一','二','三','四','五','六','七','八','九'].indexOf(roundMatch[1]) + 1 || Number(roundMatch[1])) : 1

  const { standards, failures } = standardizeAnnouncement(db, noticeText, {
    campaignId: 999002, round, phase, unitKey: unit,
  })
  for (const s of standards) { console.log(`   ▸ ${s.standard}`); okLines++ }
  for (const f of failures) { console.log(`   ✗ "${f.fragment}" — ${f.message}`); failLines++ }
  total++
}

console.log(`\n===== ${total} 条公告：标准行动单 ${okLines} 条，未识别 ${failLines} 条 =====`)
