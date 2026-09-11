// 别名包：把玩家常见的简写/俗称/谐音归一到白名单动词（幂等，重复跑安全）
//   来源：tools/parser-stress.mjs 压力测试的失败清单（2026-09-11 首轮 117 条失败全为动词不认识）
//   用法：node scripts/seed-alias-pack.mjs
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const requireCjs = createRequire(import.meta.url)
const Database = requireCjs('better-sqlite3')

const dbPath = process.env.FATE_GM_DB_PATH || join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'gm_helper.db')
const db = new Database(dbPath)

// 别名 → 规范动词（必须是 action_rules 白名单内的 action_key）
const PACK = {
  // 机动
  '位移': '机动', '移动': '机动', '去': '机动',
  // 魂食家族
  '吃饭': '魂食', '吸食': '魂食', '进食': '魂食',
  '遮断': '魂食遮断', '挡饭': '魂食遮断',
  '恶食': '恶性魂食', '恶性': '恶性魂食',
  '无限魂食': '无限制魂食', '无限': '无限制魂食',
  // 干涉/袭击
  '干预': '干涉',
  '偷袭': '袭击', '夜袭': '袭击',
  // 信息系
  '广侦': '广泛侦查', '广域侦查': '广泛侦查', '广泛侦查（全图）': '广泛侦查',
  '调查': '情报调查', '情报侦查': '情报调查', '查一下': '情报调查',
  '资分': '资料分析', '资料分柝': '资料分析', '分析资料': '资料分析',
  '猜名': '真名猜测', '真名推定': '真名猜测', '猜': '真名猜测',
  // 休整
  '休息': '休整', '休生': '休整', '苟一轮': '休整',
}

const valid = new Set(db.prepare('SELECT action_key FROM action_rules').all().map(r => r.action_key))
const ins = db.prepare(`INSERT INTO alias_registry (alias, canonical, kind, note) VALUES (?, ?, 'action', ?)`)
let n = 0, skip = []
for (const [alias, canon] of Object.entries(PACK)) {
  if (!valid.has(canon)) { skip.push(`${alias}→${canon}（白名单没有 ${canon}）`); continue }
  ins.run(alias, canon, '压力测试别名包')
  n++
}
console.log(`别名包写入 ${n} 条${skip.length ? `，跳过 ${skip.join('、')}` : ''}`)
