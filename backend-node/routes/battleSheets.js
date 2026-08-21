const express = require('express');
const { getDb } = require('../db');
const { parseRequiredId } = require('../lib/validators');

const router = express.Router();

// 获取或创建战斗表
router.get('/', (req, res) => {
  const db = getDb();
  const { campaignId, roundId } = req.query;
  const parsedCampaignId = parseRequiredId(campaignId, 'campaignId', res);
  if (parsedCampaignId === null) return;
  const parsedRoundId = parseRequiredId(roundId, 'roundId', res);
  if (parsedRoundId === null) return;

  let sheet = db.prepare(
    'SELECT * FROM battle_sheet WHERE campaign_id = ? AND round_id = ? LIMIT 1'
  ).get(parsedCampaignId, parsedRoundId);

  if (!sheet) {
    const result = db.prepare(
      'INSERT INTO battle_sheet (campaign_id, round_id) VALUES (?, ?)'
    ).run(parsedCampaignId, parsedRoundId);
    sheet = db.prepare('SELECT * FROM battle_sheet WHERE id = ?').get(result.lastInsertRowid);
  }

  res.json(formatSheet(db, sheet));
});

// 查询战斗复盘快照
router.get('/snapshots', (req, res) => {
  const db = getDb();
  const { campaignId, roundId } = req.query;
  const parsedCampaignId = parseRequiredId(campaignId, 'campaignId', res);
  if (parsedCampaignId === null) return;

  const params = [parsedCampaignId];
  let where = 'WHERE campaign_id = ?';
  if (roundId) {
    const parsedRoundId = parseRequiredId(roundId, 'roundId', res);
    if (parsedRoundId === null) return;
    where += ' AND round_id = ?';
    params.push(parsedRoundId);
  }

  const rows = db.prepare(`
    SELECT * FROM battle_review_snapshot
    ${where}
    ORDER BY turn_number DESC, created_at DESC, id DESC
  `).all(...params);

  res.json(rows.map(formatSnapshot));
});

// 更新
router.put('/:id', (req, res) => {
  const db = getDb();
  const id = parseRequiredId(req.params.id, 'id', res);
  if (id === null) return;
  const existing = db.prepare('SELECT * FROM battle_sheet WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '未找到战斗表' });

  const reqBody = req.body || {};
  const nextSettlementConfirmed = reqBody.settlementConfirmed !== undefined
    ? (reqBody.settlementConfirmed ? 1 : 0)
    : existing.settlement_confirmed;
  const confirmedAt = reqBody.settlementConfirmed !== undefined
    ? (reqBody.settlementConfirmed ? new Date().toISOString() : null)
    : existing.confirmed_at;

  db.prepare(`
    UPDATE battle_sheet SET
      blue_positions = ?,
      yellow_positions = ?,
      activated_skills = ?,
      blue_tactic = ?,
      yellow_tactic = ?,
      battlefield_width = ?,
      blue_pre_battle_bonus = ?,
      blue_pre_battle_penalty = ?,
      yellow_pre_battle_bonus = ?,
      yellow_pre_battle_penalty = ?,
      mana_data = ?,
      group_a_stats = ?,
      group_b_stats = ?,
      win_rate_result = ?,
      settlement_confirmed = ?,
      confirmed_at = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    reqBody.bluePositions ?? existing.blue_positions,
    reqBody.yellowPositions ?? existing.yellow_positions,
    reqBody.activatedSkills ?? existing.activated_skills,
    normalizeNullableText(reqBody.blueTactic, existing.blue_tactic),
    normalizeNullableText(reqBody.yellowTactic, existing.yellow_tactic),
    reqBody.battlefieldWidth ?? existing.battlefield_width ?? 0,
    reqBody.bluePreBattleBonus ?? existing.blue_pre_battle_bonus ?? 0,
    reqBody.bluePreBattlePenalty ?? existing.blue_pre_battle_penalty ?? 0,
    reqBody.yellowPreBattleBonus ?? existing.yellow_pre_battle_bonus ?? 0,
    reqBody.yellowPreBattlePenalty ?? existing.yellow_pre_battle_penalty ?? 0,
    reqBody.manaData ?? existing.mana_data,
    reqBody.groupAStats ?? existing.group_a_stats,
    reqBody.groupBStats ?? existing.group_b_stats,
    reqBody.winRateResult ?? existing.win_rate_result,
    nextSettlementConfirmed,
    confirmedAt,
    id,
  );

  const sheet = db.prepare('SELECT * FROM battle_sheet WHERE id = ?').get(id);
  res.json(formatSheet(db, sheet));
});

// 保存或更新战斗复盘快照
router.post('/:id/snapshot', (req, res) => {
  const db = getDb();
  const id = parseRequiredId(req.params.id, 'id', res);
  if (id === null) return;
  const sheet = db.prepare('SELECT * FROM battle_sheet WHERE id = ?').get(id);
  if (!sheet) return res.status(404).json({ error: '未找到战斗表' });

  const body = req.body || {};
  const snapshot = body.snapshot || {};
  const summaryText = String(body.summaryText || '').trim();
  const title = String(body.title || `第${body.turnNumber || ''}回合战斗复盘`).trim();
  const turnNumber = body.turnNumber !== undefined ? Number(body.turnNumber) : null;

  db.prepare(`
    INSERT INTO battle_review_snapshot (
      battle_sheet_id, campaign_id, round_id, turn_number, title, summary_text, snapshot_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(battle_sheet_id) DO UPDATE SET
      turn_number = excluded.turn_number,
      title = excluded.title,
      summary_text = excluded.summary_text,
      snapshot_json = excluded.snapshot_json,
      created_at = datetime('now')
  `).run(
    id,
    sheet.campaign_id,
    sheet.round_id,
    Number.isFinite(turnNumber) ? turnNumber : null,
    title || null,
    summaryText || null,
    JSON.stringify(snapshot),
  );

  const row = db.prepare('SELECT * FROM battle_review_snapshot WHERE battle_sheet_id = ?').get(id);
  res.json(formatSnapshot(row));
});

// 删除
router.delete('/:id', (req, res) => {
  const db = getDb();
  const id = parseRequiredId(req.params.id, 'id', res);
  if (id === null) return;
  db.prepare('DELETE FROM battle_sheet WHERE id = ?').run(id);
  res.status(204).end();
});

function formatSheet(db, sheet) {
  if (!sheet) return null;

  const round = db.prepare('SELECT turn_number FROM campaign_round WHERE id = ?').get(sheet.round_id);

  return {
    id: sheet.id,
    campaignId: sheet.campaign_id,
    roundId: sheet.round_id,
    turnNumber: round ? round.turn_number : null,
    bluePositions: sheet.blue_positions,
    yellowPositions: sheet.yellow_positions,
    activatedSkills: sheet.activated_skills,
    blueTactic: sheet.blue_tactic,
    yellowTactic: sheet.yellow_tactic,
    battlefieldWidth: sheet.battlefield_width ?? 0,
    bluePreBattleBonus: sheet.blue_pre_battle_bonus ?? 0,
    bluePreBattlePenalty: sheet.blue_pre_battle_penalty ?? 0,
    yellowPreBattleBonus: sheet.yellow_pre_battle_bonus ?? 0,
    yellowPreBattlePenalty: sheet.yellow_pre_battle_penalty ?? 0,
    manaData: sheet.mana_data,
    groupAStats: sheet.group_a_stats,
    groupBStats: sheet.group_b_stats,
    winRateResult: sheet.win_rate_result,
    settlementConfirmed: !!sheet.settlement_confirmed,
    confirmedAt: sheet.confirmed_at,
    createdAt: sheet.created_at,
    updatedAt: sheet.updated_at,
  };
}

function normalizeNullableText(value, fallback) {
  if (value === undefined) return fallback;
  if (value === null) return null;
  return String(value).trim() === '' ? null : String(value);
}

function formatSnapshot(row) {
  return {
    id: row.id,
    battleSheetId: row.battle_sheet_id,
    campaignId: row.campaign_id,
    roundId: row.round_id,
    turnNumber: row.turn_number,
    title: row.title,
    summaryText: row.summary_text,
    snapshot: parseJson(row.snapshot_json, {}),
    createdAt: row.created_at,
  };
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

module.exports = router;
module.exports.formatSnapshot = formatSnapshot;
