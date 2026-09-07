// M3 离线回放：模拟一场战斗（蓝：吕布+曹丕 vs 黄：魏延+刘协），验证胜率链逐步输出
// 卡数据从正式库读取（id 16=吕布 21=曹丕 19=魏延 18=刘协）
import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { calcSideStats, applyTactics, calcWinRate, finalJudge, afterBattleLedger } from './battle.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const db = new DatabaseSync(join(root, 'backend-node', 'data', 'gm_helper.db'))

// ---------- 编队 ----------
const blue = { main: '枪从', assists: ['枪御'] }    // 吕布(主) + 曹丕(辅)
const yellow = { main: '狂从', assists: ['剑从'] } // 魏延(主) + 刘协(辅)

const blueStats = calcSideStats(db, 999002, blue)
const yellowStats = calcSideStats(db, 999002, yellow)
console.log('===== 计算表 =====')
console.log('蓝方:', JSON.stringify(blueStats.totals), blueStats.missing.length ? `缺卡:${blueStats.missing}` : '')
console.log('黄方:', JSON.stringify(yellowStats.totals), yellowStats.missing.length ? `缺卡:${yellowStats.missing}` : '')

// ---------- 战术（蓝=强击 克 黄=扼守 → 黄无效） ----------
const tactics = applyTactics('强击', '扼守', blueStats.totals, yellowStats.totals)
console.log('\n===== 战术 =====')
console.log(`蓝=强击 vs 黄=扼守 → ${tactics.counter}（黄战术无效:${tactics.yellowInvalid}）`)
console.log(`强击加成: 蓝 ${tactics.effect.blue?.statBonus?.attr} +20`)

// ---------- 初始工序：选主要属性 + 随机属性 ----------
const blueMainAttr = 'strength' // 吕布主力选筋力
const yellowMainAttr = 'endurance'
const randomAttr = 'agility'    // 骰定（此处固定演示）

// ---------- 修正累计 ----------
const corrections = {
  blue: { main: 20 },   // 例：蓝方主要工序发动技能 +20% 胜率
  yellow: { final: 20 } // 例：黄方最终工序死斗 +20%
}

console.log('\n===== 胜率链 =====')
const wr = calcWinRate({
  blueStats, yellowStats,
  attackSide: 'blue',
  blueMainAttr, yellowMainAttr, randomAttr,
  tactics, corrections,
  floorPenalty: { blue: 0, yellow: 0 },
  options: { diffHalve: false },
})
for (const c of wr.comparisons) {
  console.log(`  ${c.label}: ${c.a} vs ${c.b} → ${c.score === 3 ? '优' : c.score === 2 ? '平' : '劣'}（${c.score} 分）`)
}
console.log(`  合计 ${wr.score} 分 → 基础胜率 ${wr.baseRate}%`)
console.log(`  等级差（蓝-黄主力）: ${wr.levelDiff}`)
console.log(`  属性总计差（含战术加成）: ${wr.statDiff}`)
console.log(`  蓝方累计 = ${wr.baseRate} + ${wr.levelDiff} + ${wr.statDiff} + 修正 = ${wr.blueRaw}`)
console.log(`  黄方累计 = ${wr.baseRate} − ${wr.levelDiff} − ${wr.statDiff} + 修正 = ${wr.yellowRaw}`)
console.log(`  实际胜率 = 50 + (${wr.blueRaw} − ${wr.yellowRaw})/2 = ${wr.actualBeforeClamp}%`)
if (wr.clampedByFloor) console.log(`  ⚠️ 触发底限 clamp → ${wr.actual}%`)

// ---------- 决胜 ----------
const roll = 45
const judge = finalJudge(wr.actual, roll)
console.log(`\n===== 决胜检定 =====`)
console.log(`D100=${roll} vs 蓝方胜率 ${wr.actual}% → ${judge.winner === 'blue' ? '蓝方胜' : '黄方胜'}（${judge.note}）`)

// ---------- 战后清算 ----------
const ledger = afterBattleLedger(db, { blue, yellow })
console.log(`\n===== 战后清算（等级魔耗） =====`)
for (const n of ledger) console.log(`  ${n.role}: ${n.delta}（${n.reason}）`)
