// 战前准备：补录张角卡（源：_cards dump 合计行）+ 输出枪组 vs 术组战斗计算表
import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { calcSideStats, applyTactics } from '../engine/battle.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const db = new DatabaseSync(join(root, 'backend-node', 'data', 'gm_helper.db'))
const CAMPAIGN = 999002

// ---------- 1. 补录张角卡（术从） ----------
let zhangjiao = db.prepare(`SELECT id FROM character_card WHERE code = '张角' AND campaign_id = ?`).get(CAMPAIGN)
if (!zhangjiao) {
  const r = db.prepare(`
    INSERT INTO character_card (code, class_name, card_type, campaign_id,
      total_level, total_strength, total_endurance, total_agility, total_mana, total_luck, total_noble_phantasm,
      base_level, base_strength, base_endurance, base_agility, base_mana, base_luck, base_noble_phantasm,
      class_skills, personal_skills, noble_phantasms, retired)
    VALUES ('张角', 'Caster', 'SERVANT', ?, 70, 20, 20, 20, 90, 40, 0, 70, 20, 20, 20, 90, 40, 0,
      '["天公大使(C)","太平要术A(魔境的智慧A?)","千里眼·鹰之瞳(A)"]',
      '["待 GM 从损坏 xlsx 补录"]',
      '["太平要术(对军?)"]', 0)
  `).run(CAMPAIGN)
  zhangjiao = { id: r.lastInsertRowid }
  console.log(`[补卡] 张角(Caster) 已录入 id=${zhangjiao.id}（属性来自 _cards dump 合计行；技能/宝具待 GM 核对）`)
} else {
  console.log(`[补卡] 张角已存在 id=${zhangjiao.id}`)
}
// unit_registry 关联
db.prepare(`UPDATE unit_registry SET card_id = ?, missing = 0 WHERE unit_key = '术从'`).run(zhangjiao.id)
console.log('[映射] 术从 → 张角 已关联')

// ---------- 2. 战斗计算表 ----------
const blue = { main: '枪从', assists: ['枪御'] }   // 袭击方：吕布+曹丕
const yellow = { main: '术从', assists: ['术御'] } // 防守方：张角+曹植

const blueStats = calcSideStats(db, CAMPAIGN, blue)
const yellowStats = calcSideStats(db, CAMPAIGN, yellow)

console.log('\n===== 战斗计算表：枪组(袭) vs 术组(守) @许都 =====')
console.log(`蓝(枪组) 合计: ${JSON.stringify(blueStats.totals)}`)
for (const u of blueStats.units) console.log(`   ${u.slot}: ${u.unitKey}(${u.code}) ${JSON.stringify(u.stats)}`)
console.log(`黄(术组) 合计: ${JSON.stringify(yellowStats.totals)}`)
for (const u of yellowStats.units) console.log(`   ${u.slot}: ${u.unitKey}(${u.code}) ${JSON.stringify(u.stats)}`)
if (blueStats.missing.length || yellowStats.missing.length) {
  console.log(`⚠️ 缺卡: ${[...blueStats.missing, ...yellowStats.missing].join(',')}`)
}

// ---------- 3. 战术模拟（默认：蓝=强击 黄=扼守；实际以 GM 宣言为准） ----------
const tactics = applyTactics('强击', '扼守', blueStats.totals, yellowStats.totals)
console.log('\n===== 战术 =====')
console.log(`蓝强击 vs 黄扼守 → ${tactics.counter}（黄无效:${tactics.yellowInvalid}）；强击加蓝最高属性 +20`)

// ---------- 4. 魔力现状（防守方魔力不足惩罚预查） ----------
for (const [label, cardId] of [['吕布', 16], ['曹丕', 21], ['张角', zhangjiao.id], ['曹植', 22]]) {
  const row = db.prepare(`SELECT current_mana, mana_limit FROM character_status WHERE character_card_id = ? ORDER BY id DESC LIMIT 1`).get(cardId)
  console.log(`魔力现状 ${label}: ${row ? JSON.stringify(row) : '（无状态记录）'}`)
}

console.log('\n===== 交给 GM 的实战输入 =====')
console.log('1. 双方战术宣言（战斗开始时，主力位选择）')
console.log('2. 初始工序：双方主力位选[主要属性]；引擎骰[随机属性]')
console.log('3. 主要/最终工序：技能宝具发动（术组：太平要术/千里眼；枪组：待录）')
console.log('4. 引擎按本表出胜率链与决胜检定')
