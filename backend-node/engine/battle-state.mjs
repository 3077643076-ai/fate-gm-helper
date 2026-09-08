// 战斗状态机：引擎战斗流程的可操作封装（建战斗→战术→属性→修正→决胜→清算）
// 每一步都读 engine_battles 的当前状态，校验阶段后推进——GM/面板/QQ 都能驱动
import { calcSideStats, applyTactics, calcWinRate, finalJudge, afterBattleLedger, STATS } from './battle.mjs'

const STAGE_ORDER = ['formation', 'initial', 'main', 'final', 'done']

/** 取战斗记录并解析 JSON 字段 */
export function getBattle(db, battleId) {
  const row = db.prepare(`SELECT * FROM engine_battles WHERE id = ?`).get(battleId)
  if (!row) return null
  const j = (v, d) => { try { return JSON.parse(v ?? null) ?? d } catch { return d } }
  // corrections 规范化：保证 blue/yellow 两侧的修正桶永远存在（新建战斗 corrections={}）
  const rawCorr = j(row.corrections, {})
  const defCorr = { pre: 0, initial: 0, main: 0, final: 0, statBonus: 0 }
  const corrections = {
    blue: { ...defCorr, ...(rawCorr.blue ?? {}) },
    yellow: { ...defCorr, ...(rawCorr.yellow ?? {}) },
  }
  return {
    ...row,
    blueFormation: j(row.blue_formation, {}),
    yellowFormation: j(row.yellow_formation, {}),
    tacticResult: j(row.tactic_result, {}),
    corrections,
    floorPenalty: j(row.floor_penalty, {}),
    deathFight: j(row.death_fight, {}),
    winRate: j(row.win_rate, null),
    result: j(row.result, null),
  }
}

function save(db, battleId, fields) {
  const sets = Object.keys(fields).map(k => `${k} = @${k}`).join(', ')
  db.prepare(`UPDATE engine_battles SET ${sets}, updated_at = datetime('now','localtime') WHERE id = @id`)
    .run({ ...fields, id: battleId })
}

/** 阶段校验：当前阶段必须等于期望（done 后锁死） */
function requireStage(battle, stage) {
  if (battle.status !== stage) {
    return `战斗 #${battle.id} 当前阶段 ${battle.status}，此操作需在 ${stage} 阶段`
  }
  return null
}

/** 1. 创建战斗：地点/宽度/双方编队 → 自动算计算表 */
export function createBattle(db, p) {
  const blueStats = calcSideStats(db, p.campaignId, p.blue)
  const yellowStats = calcSideStats(db, p.campaignId, p.yellow)
  const r = db.prepare(`
    INSERT INTO engine_battles (campaign_id, round, phase, leyline, width, attacker,
      blue_formation, yellow_formation, blue_stats, yellow_stats, missing_notes, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?, 'formation')
  `).run(
    p.campaignId, p.round ?? null, p.phase ?? null, p.leyline ?? null, p.width ?? 3,
    p.attacker ?? 'blue',
    JSON.stringify(p.blue), JSON.stringify(p.yellow),
    JSON.stringify(blueStats), JSON.stringify(yellowStats),
    JSON.stringify({ blue: blueStats.missing, yellow: yellowStats.missing })
  )
  return { battleId: r.lastInsertRowid, blueStats, yellowStats }
}

/** 计算表读取（含缺卡提示） */
export function battleStats(db, battle) {
  return {
    blue: calcSideStats(db, battle.campaign_id, battle.blueFormation),
    yellow: calcSideStats(db, battle.campaign_id, battle.yellowFormation),
  }
}

/** 2. 战斗开始时：双方战术宣言 → 克制结算 → 进入初始工序 */
export function setTactics(db, battleId, blueTactic, yellowTactic) {
  const battle = getBattle(db, battleId)
  const err = requireStage(battle, 'formation')
  if (err) return { ok: false, error: err }
  const stats = battleStats(db, battle)
  const tactics = applyTactics(blueTactic, yellowTactic, stats.blue.totals, stats.yellow.totals)

  // 战术效果入修正/底限/属性加成
  const corrections = battle.corrections
  const floorPenalty = battle.floorPenalty
  for (const side of ['blue', 'yellow']) {
    const eff = tactics.effect[side]
    if (!eff) continue
    if (eff.winRate) corrections[side].pre = (corrections[side].pre ?? 0) + eff.winRate
    if (eff.floorPenalty) floorPenalty[side === 'blue' ? 'yellow' : 'blue'] =
      (floorPenalty[side === 'blue' ? 'yellow' : 'blue'] ?? 0) + eff.floorPenalty
  }
  // 强击的属性加成在胜率链的属性总计里体现（tactics.effect 传递）

  save(db, battleId, {
    blue_tactic: blueTactic, yellow_tactic: yellowTactic,
    tactic_result: JSON.stringify(tactics),
    corrections: JSON.stringify(corrections),
    floor_penalty: JSON.stringify(floorPenalty),
    status: 'initial',
  })
  return {
    ok: true,
    counter: tactics.counter,
    invalid: { blue: tactics.blueInvalid, yellow: tactics.yellowInvalid },
    effects: tactics.effect,
    next: 'initial（初始工序：双方主力位选主要属性）',
  }
}

/** 3. 初始工序：双方主力位选主要属性 → 骰随机属性 → 出第一版胜率链 → 进入主要工序 */
export function setMainAttrs(db, battleId, blueMainAttr, yellowMainAttr, randomAttr) {
  const battle = getBattle(db, battleId)
  const err = requireStage(battle, 'initial')
  if (err) return { ok: false, error: err }
  const valid = [...STATS, 'noblePhantasm']
  for (const [label, attr] of [['蓝主要属性', blueMainAttr], ['黄主要属性', yellowMainAttr]]) {
    if (!valid.includes(attr)) return { ok: false, error: `${label} "${attr}" 不在六维属性中` }
  }
  const random = randomAttr ?? valid[Math.floor(Math.random() * valid.length)]

  save(db, battleId, {
    blue_main_attr: blueMainAttr, yellow_main_attr: yellowMainAttr, random_attr: random,
    status: 'main',
  })
  const wr = currentWinRate(db, battleId)
  return { ok: true, randomAttr: random, winRate: wr, next: 'main（主要工序：能力发动/修正）' }
}

/** 4. 工序修正：属性加成（statBonus）或胜率修正（initial/main/final/pre），累加进修正表 */
export function applyCorrection(db, battleId, stage, side, value, note) {
  const battle = getBattle(db, battleId)
  if (!['pre', 'statBonus', 'initial', 'main', 'final'].includes(stage)) {
    return { ok: false, error: 'stage 须为 pre/statBonus/initial/main/final（statBonus=属性补正，每点=1 胜率）' }
  }
  if (battle.status === 'formation' || battle.status === 'done') return { ok: false, error: `当前阶段 ${battle.status} 不可加修正` }
  const corrections = battle.corrections
  if (stage === 'statBonus') {
    corrections[side].statBonus = (corrections[side].statBonus ?? 0) + Number(value)
  } else {
    corrections[side][stage] = (corrections[side][stage] ?? 0) + Number(value)
  }
  save(db, battleId, { corrections: JSON.stringify(corrections) })
  const wr = currentWinRate(db, battleId)
  return { ok: true, applied: `${side}.${stage} ${value > 0 ? '+' : ''}${value}${note ? '（' + note + '）' : ''}`, winRate: wr }
}

/** 当前胜率链即时计算（每步操作后都可查看） */
export function currentWinRate(db, battleId) {
  const battle = getBattle(db, battleId)
  const stats = battleStats(db, battle)
  const wr = calcWinRate({
    blueStats: stats.blue, yellowStats: stats.yellow,
    attackSide: battle.attacker,
    blueMainAttr: battle.blue_main_attr ?? 'strength',
    yellowMainAttr: battle.yellow_main_attr ?? 'endurance',
    randomAttr: battle.random_attr ?? 'agility',
    tactics: { effect: battle.tacticResult?.effect ?? {} },
    corrections: battle.corrections,
    floorPenalty: battle.floorPenalty,
    options: { diffHalve: false },
  })
  save(db, battleId, { win_rate: JSON.stringify(wr) })
  return wr
}

/** 5. 最终工序→决胜：死斗宣言（可选）+ D100 决胜 → 战斗结束时清算 */
export function finalize(db, battleId, { blueDeath = false, yellowDeath = false, roll } = {}) {
  const battle = getBattle(db, battleId)
  const err = requireStage(battle, 'main')
  if (err) return { ok: false, error: err }
  const corrections = battle.corrections
  const deathFight = {}
  if (blueDeath) { corrections.blue.final = (corrections.blue.final ?? 0) + 20; deathFight.blue = true }
  if (yellowDeath) { corrections.yellow.final = (corrections.yellow.final ?? 0) + 20; deathFight.yellow = true }
  if (blueDeath || yellowDeath) save(db, battleId, { corrections: JSON.stringify(corrections), death_fight: JSON.stringify(deathFight) })

  const wr = currentWinRate(db, battleId)
  const finalRoll = Number.isFinite(Number(roll)) ? Number(roll) : Math.floor(Math.random() * 100) + 1
  const judge = finalJudge(wr.actual, finalRoll)

  // 战斗结束时清算：参战从者等级魔耗（支援位不计）
  const ledger = afterBattleLedger(db, { blue: battle.blueFormation, yellow: battle.yellowFormation })
  const insLedger = db.prepare(`INSERT INTO mana_ledger (role, delta, reason, source, round, phase) VALUES (?,?,?,?,?,?)`)
  for (const n of ledger) insLedger.run(n.role, n.delta, n.reason, '战斗', battle.round, battle.phase)

  save(db, battleId, {
    result: JSON.stringify({ winner: judge.winner, roll: finalRoll, rate: wr.actual, note: judge.note, ledger }),
    status: 'done',
  })
  return { ok: true, winner: judge.winner, roll: finalRoll, rate: wr.actual, ledger, note: judge.note }
}
