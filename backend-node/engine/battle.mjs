// 战斗引擎核心（M3）：编队 → 战术 → 工序修正 → 胜率链 → 决胜 → 清算
// 规格来源：docs/战斗结算规格.md（规则书战斗章 + Excel 六大清单 + 前端移植公式）
// 设计：胜率链是纯函数；状态存 engine_battles 表；能力联动（技能模板）M2 接入
import { DatabaseSync } from 'node:sqlite'

// ---------- 常量（规则书口径） ----------
const BASE_RATE_TABLE = {
  9: 90, 8: 80, 7: 70, 6: 60, 5: 50, 4: 40, 3: 30, 2: 20, 1: 10,
}
const TACTIC_COUNTER = { 强击: '扼守', 破袭: '强击', 试探: '破袭', 扼守: '试探' } // A 克制 B：A>B
export const STATS = ['strength', 'endurance', 'agility', 'mana', 'luck'] // 除等级/宝具外的可修正属性
const FLOOR_RATE = 10 // 底限胜率

/** 三属性对抗 → 基础胜率（优3/平2/劣1） */
export function mapScoreToBaseRate(score) {
  return BASE_RATE_TABLE[score] ?? null
}

/** 逐属性对比：攻/守 → 优平劣计分 */
export function compareStat(a, b) {
  if (a > b) return 3
  if (a === b) return 2
  return 1
}

/** 战术克制：返回 'blueCounter'/'yellowCounter'/'none' */
export function tacticCounter(blueTactic, yellowTactic) {
  if (!blueTactic || !yellowTactic) return 'none'
  if (TACTIC_COUNTER[blueTactic] === yellowTactic) return 'blueCounter'
  if (TACTIC_COUNTER[yellowTactic] === blueTactic) return 'yellowCounter'
  return 'none'
}

// ---------- 编队与计算表 ----------
/**
 * 编队格式：{ main: '狂从', assists: ['狂御'], servant: null, support: null }
 * 属性来源：unit_registry.unit_key → card_id → character_card.total_*（合计属性）
 */
export function calcSideStats(db, campaignId, formation) {
  const units = []
  const totals = { level: 0, strength: 0, endurance: 0, agility: 0, mana: 0, luck: 0, noblePhantasm: 0 }

  const take = (unitKey, half, slot) => {
    if (!unitKey) return
    const reg = db.prepare(`SELECT card_id, code, missing FROM unit_registry WHERE unit_key = ?`).get(unitKey)
    const card = reg?.card_id
      ? db.prepare(`SELECT total_level, total_strength, total_endurance, total_agility, total_mana, total_luck, total_noble_phantasm FROM character_card WHERE id = ?`).get(reg.card_id)
      : null
    if (!card) {
      units.push({ unitKey, slot, code: reg?.code ?? unitKey, missing: true })
      return
    }
    const factor = half ? 0.5 : 1
    const stats = {
      level: Math.floor((card.total_level ?? 0) * factor),
      strength: Math.floor((card.total_strength ?? 0) * factor),
      endurance: Math.floor((card.total_endurance ?? 0) * factor),
      agility: Math.floor((card.total_agility ?? 0) * factor),
      mana: Math.floor((card.total_mana ?? 0) * factor),
      luck: Math.floor((card.total_luck ?? 0) * factor),
      noblePhantasm: Math.floor((card.total_noble_phantasm ?? 0) * factor),
    }
    units.push({ unitKey, slot, code: reg.code, stats })
    for (const k of Object.keys(totals)) totals[k] += stats[k]
  }

  take(formation.main, false, 'main')
  for (const a of formation.assists ?? []) take(a, true, 'assist')
  if (formation.servant) take(formation.servant, true, 'servant')
  // 支援位不计属性

  return { units, totals, missing: units.filter(u => u.missing).map(u => u.unitKey) }
}

// ---------- 战术效果 ----------
/**
 * 返回 { blueCounter, effect: { blue: {winRate, statBonus:{attr,value}}, yellow: {...} } }
 * 被克制方战术无效；强击默认加最高属性（可由 gmAttr 覆盖）
 */
export function applyTactics(blueTactic, yellowTactic, blueStats, yellowStats, gmAttr) {
  const counter = tacticCounter(blueTactic, yellowTactic)
  const effect = { blue: null, yellow: null }
  const apply = (tactic, side, myTotals, oppTotals) => {
    if (!tactic) return
    const best = STATS.reduce((a, b) => (myTotals[a] >= myTotals[b] ? a : b), 'strength')
    if (tactic === '强击') effect[side] = { name: tactic, winRate: 0, statBonus: { attr: gmAttr ?? best, value: 20 } }
    if (tactic === '破袭') effect[side] = { name: tactic, winRate: 0, floorPenalty: -20, note: '敌方主力底限穿透-20%' }
    if (tactic === '试探') effect[side] = { name: tactic, winRate: 0, note: '无损撤退 FP-1（撤退阶段生效）' }
    if (tactic === '扼守') effect[side] = { name: tactic, winRate: 20 }
  }
  const blueInvalid = counter === 'yellowCounter'
  const yellowInvalid = counter === 'blueCounter'
  if (!blueInvalid) apply(blueTactic, 'blue', blueStats, yellowStats)
  if (!yellowInvalid) apply(yellowTactic, 'yellow', yellowStats, blueStats)
  return { counter, blueInvalid, yellowInvalid, effect }
}

// ---------- 胜率链 ----------
/**
 * @param {object} p
 *   blueStats/yellowStats: calcSideStats 结果
 *   attackSide: 'blue'|'yellow'（袭击方，决定主要属性对抗顺序）
 *   blueMainAttr/yellowMainAttr: 双方主力选的主要属性（strength 等）
 *   randomAttr: 随机属性
 *   tactics: applyTactics 结果
 *   corrections: { blue: {initial: n, main: n, final: n, pre: n}, yellow: {...} } 工序修正累计（含死斗/冲锋/技能）
 *   floorPenalty: { blue: n, yellow: n } 底限穿透
 *   options: { diffHalve: boolean } 差值减半（默认关）
 */
export function calcWinRate(p) {
  const { blueStats, yellowStats, attackSide, blueMainAttr, yellowMainAttr, randomAttr, corrections } = p
  const defCorr = { pre: 0, initial: 0, main: 0, final: 0 }
  const corr = {
    blue: { ...defCorr, ...(corrections?.blue ?? {}) },
    yellow: { ...defCorr, ...(corrections?.yellow ?? {}) },
  }

  // 1) 三属性对抗 → 基础胜率（攻方主力主要属性 / 守方主力主要属性 / 随机属性，各比一次）
  const atkAttr = attackSide === 'blue' ? blueMainAttr : yellowMainAttr
  const defAttr = attackSide === 'blue' ? yellowMainAttr : blueMainAttr
  const atkTotals = attackSide === 'blue' ? blueStats.totals : yellowStats.totals
  const defTotals = attackSide === 'blue' ? yellowStats.totals : blueStats.totals
  const comparisons = [
    { label: `攻方主力·主要属性(${atkAttr})`, a: atkTotals[atkAttr], b: defTotals[defAttr] },
    { label: `守方主力·主要属性(${defAttr})`, a: defTotals[defAttr], b: atkTotals[atkAttr] },
    { label: `随机属性(${randomAttr})`, a: atkTotals[randomAttr], b: defTotals[randomAttr] },
  ].map(item => ({ ...item, score: compareStat(item.a, item.b) }))

  const score = comparisons.reduce((s, c) => s + c.score, 0)
  const baseRate = mapScoreToBaseRate(score)

  // 2) 等级差（双方主力位等级，每点=1 胜率，已含在属性总计里？——规格：主力位每点等级独立计）
  const blueLevel = blueStats.units.find(u => u.slot === 'main')?.stats?.level ?? 0
  const yellowLevel = yellowStats.units.find(u => u.slot === 'main')?.stats?.level ?? 0
  const levelDiff = blueLevel - yellowLevel

  // 3) 属性补正差（胜率链里的"属性补正"= 技能/战术带来的属性加成，每点=1 胜率；
  //    面板总计不在此重复计——它已经体现在三属性对比的基础胜率里）
  const tacticStatBlue = p.tactics?.effect?.blue?.statBonus
    ? p.tactics.effect.blue.statBonus.value : 0
  const tacticStatYellow = p.tactics?.effect?.yellow?.statBonus
    ? p.tactics.effect.yellow.statBonus.value : 0
  const corrStatBlue = Number(p.corrections?.blue?.statBonus ?? 0)
  const corrStatYellow = Number(p.corrections?.yellow?.statBonus ?? 0)
  const statDiffTotal = (tacticStatBlue + corrStatBlue) - (tacticStatYellow + corrStatYellow)

  // 5) 工序胜率修正累计（战术扼守/死斗/技能/冲锋等由 GM 或联动填入 corrections）
  const blueCorr = corr.blue.pre + corr.blue.initial + corr.blue.main + corr.blue.final
  const yellowCorr = corr.yellow.pre + corr.yellow.initial + corr.yellow.main + corr.yellow.final

  // 6) 双向抵消至 100：实际胜率 = 50 + (蓝-黄)/2
  const blueRaw = baseRate + levelDiff + statDiffTotal + blueCorr
  const yellowRaw = baseRate + -levelDiff + -statDiffTotal + yellowCorr
  let actual = 50 + (blueRaw - yellowRaw) / 2

  // 7) 差值减半（可选，默认关；双从者主力时）
  if (p.options?.diffHalve) {
    actual = 50 + (actual - 50) / 2
  }

  // 8) 保底 clamp：[己方底限, 100 − 对方底限]，底限 10% + 穿透修正
  const blueFloor = Math.max(0, FLOOR_RATE + (p.floorPenalty?.blue ?? 0))
  const yellowFloor = Math.max(0, FLOOR_RATE + (p.floorPenalty?.yellow ?? 0))
  const clamped = Math.min(Math.max(actual, blueFloor), 100 - yellowFloor)

  return {
    comparisons, score, baseRate, levelDiff, statDiff: statDiffTotal,
    blueRaw, yellowRaw, actualBeforeClamp: actual,
    floors: { blue: blueFloor, yellow: yellowFloor },
    actual: clamped, clampedByFloor: clamped !== actual,
  }
}

// ---------- 决胜与清算 ----------
/** 决胜检定：D100 ≤ 蓝方实际胜率 → 蓝胜 */
export function finalJudge(actualBlueRate, roll) {
  if (actualBlueRate >= 100) return { winner: 'blue', note: '胜率≥100%，自动成功' }
  return { winner: roll <= actualBlueRate ? 'blue' : 'yellow', note: `D100=${roll}/${actualBlueRate}` }
}

/** 战斗结束清算：参战从者等级魔耗（等级/2，支援位不计） */
export function afterBattleLedger(db, formation) {
  const notes = []
  for (const side of ['blue', 'yellow']) {
    const f = formation[side]
    const units = [f.main, ...(f.assists ?? []), f.servant].filter(Boolean)
    for (const unitKey of units) {
      if (unitKey === f.support) continue
      const reg = db.prepare(`SELECT card_id FROM unit_registry WHERE unit_key = ?`).get(unitKey)
      const card = reg?.card_id ? db.prepare(`SELECT code, total_level, card_type FROM character_card WHERE id = ?`).get(reg.card_id) : null
      if (!card || card.card_type !== 'SERVANT') continue
      const cost = Math.floor((card.total_level ?? 0) / 2)
      notes.push({ role: unitKey, delta: -cost, reason: `战斗等级魔耗`, source: '战斗' })
    }
  }
  return notes
}
