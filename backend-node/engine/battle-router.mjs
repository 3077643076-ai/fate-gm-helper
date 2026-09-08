// 战斗流程 API 路由：/api/engine/battles（创建/战术/属性/修正/决胜/查询）
import { Router } from 'express'
import { createBattle, setTactics, setMainAttrs, applyCorrection, finalize, getBattle, currentWinRate, battleStats } from './battle-state.mjs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const db = new DatabaseSync(process.env.FATE_GM_DB_PATH || join(root, 'backend-node', 'data', 'gm_helper.db'))

const router = Router()

// 创建战斗
router.post('/battles', (req, res) => {
  const { campaignId, round, phase, leyline, width, blue, yellow, attacker } = req.body ?? {}
  if (!requireCampaignIdCompat(campaignId)) return res.status(400).json({ error: '需要 campaignId' })
  if (!blue?.main || !yellow?.main) return res.status(400).json({ error: '双方编队都需要 main（主力位单位键）' })
  const r = createBattle(db, { campaignId, round, phase, leyline, width, blue, yellow, attacker })
  res.json({ ok: true, battleId: r.battleId, blueTotals: r.blueStats.totals, yellowTotals: r.yellowStats.totals, missing: [...r.blueStats.missing, ...r.yellowStats.missing], status: 'formation' })
})

// 查询战斗（含即时胜率链）
router.get('/battles/:id', (req, res) => {
  const battle = getBattle(db, req.params.id)
  if (!battle) return res.status(404).json({ error: '战斗不存在' })
  let winRate = battle.winRate
  if (battle.status !== 'formation' && battle.status !== 'done') winRate = currentWinRate(db, battle.id)
  res.json({ ...battle, winRate, stats: battleStats(db, battle) })
})

// 战术宣言（战斗开始时）
router.post('/battles/:id/tactics', (req, res) => {
  const { blue, yellow } = req.body ?? {}
  const r = setTactics(db, req.params.id, blue ?? null, yellow ?? null)
  if (!r.ok) return res.status(409).json(r)
  res.json(r)
})

// 主要属性选择（初始工序）
router.post('/battles/:id/attrs', (req, res) => {
  const { blue, yellow, random } = req.body ?? {}
  const r = setMainAttrs(db, req.params.id, blue, yellow, random)
  if (!r.ok) return res.status(409).json(r)
  res.json(r)
})

// 工序修正（主要/最终工序能力发动）
router.post('/battles/:id/correction', (req, res) => {
  const { stage, side, value, note } = req.body ?? {}
  const r = applyCorrection(db, req.params.id, stage, side, Number(value), note)
  if (!r.ok) return res.status(409).json(r)
  res.json(r)
})

// 决胜：死斗宣言（可选）+ D100（不传 roll 则引擎掷）
router.post('/battles/:id/finalize', (req, res) => {
  const { blueDeath, yellowDeath, roll } = req.body ?? {}
  const r = finalize(db, req.params.id, { blueDeath, yellowDeath, roll })
  if (!r.ok) return res.status(409).json(r)
  res.json(r)
})

export default router

function requireCampaignIdCompat(id) {
  const n = Number(id)
  return Number.isInteger(n) && n > 0 ? n : null
}
