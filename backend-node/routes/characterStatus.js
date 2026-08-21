const express = require('express');
const { getDb } = require('../db');
const { parseRequiredId } = require('../lib/validators');

const router = express.Router();

// 更新或创建
router.post('/', (req, res) => {
  const db = getDb();
  const {
    characterCardId, campaignId, roundNumber,
    currentMana, manaLimit, currentCommandSeals,
    statusEffects, statusEffectsList, notes,
  } = req.body;
  const parsedCharacterCardId = parseRequiredId(characterCardId, 'characterCardId', res);
  if (parsedCharacterCardId === null) return;
  const parsedCampaignId = parseRequiredId(campaignId, 'campaignId', res);
  if (parsedCampaignId === null) return;
  const parsedRoundNumber = parseRequiredId(roundNumber, 'roundNumber', res);
  if (parsedRoundNumber === null) return;

  const existing = db.prepare(
    'SELECT * FROM character_status WHERE character_card_id = ? AND campaign_id = ? AND round_number = ?'
  ).get(parsedCharacterCardId, parsedCampaignId, parsedRoundNumber);

  if (existing) {
    db.prepare(`
      UPDATE character_status SET
        current_mana = ?, mana_limit = ?, current_command_seals = ?,
        status_effects = ?, status_effects_list = ?, notes = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      currentMana ?? existing.current_mana,
      manaLimit ?? existing.mana_limit,
      currentCommandSeals ?? existing.current_command_seals,
      statusEffects ?? existing.status_effects,
      statusEffectsList ? JSON.stringify(statusEffectsList) : existing.status_effects_list,
      notes ?? existing.notes,
      existing.id,
    );
  } else {
    db.prepare(`
      INSERT INTO character_status (character_card_id, campaign_id, round_number, current_mana, mana_limit, current_command_seals, status_effects, status_effects_list, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      parsedCharacterCardId, parsedCampaignId, parsedRoundNumber,
      currentMana ?? null, manaLimit ?? null, currentCommandSeals ?? null,
      statusEffects ?? null,
      statusEffectsList ? JSON.stringify(statusEffectsList) : null,
      notes ?? null,
    );
  }

  const row = db.prepare(
    'SELECT * FROM character_status WHERE character_card_id = ? AND campaign_id = ? AND round_number = ?'
  ).get(parsedCharacterCardId, parsedCampaignId, parsedRoundNumber);

  const card = db.prepare('SELECT code, class_name FROM character_card WHERE id = ?').get(parsedCharacterCardId);

  res.json(formatStatus(row, card));
});

// 获取单个角色状态
router.get('/single', (req, res) => {
  const db = getDb();
  const { characterCardId, campaignId, roundNumber } = req.query;
  const parsedCharacterCardId = parseRequiredId(characterCardId, 'characterCardId', res);
  if (parsedCharacterCardId === null) return;
  const parsedCampaignId = parseRequiredId(campaignId, 'campaignId', res);
  if (parsedCampaignId === null) return;
  const parsedRoundNumber = parseRequiredId(roundNumber, 'roundNumber', res);
  if (parsedRoundNumber === null) return;

  const row = db.prepare(
    'SELECT * FROM character_status WHERE character_card_id = ? AND campaign_id = ? AND round_number = ?'
  ).get(parsedCharacterCardId, parsedCampaignId, parsedRoundNumber);

  if (!row) return res.status(404).json({ error: '未找到角色状态记录' });

  const card = db.prepare('SELECT code, class_name FROM character_card WHERE id = ?').get(parsedCharacterCardId);
  res.json(formatStatus(row, card));
});

// 按战役+回合查所有状态
router.get('/campaign-round', (req, res) => {
  const db = getDb();
  const { campaignId, roundNumber } = req.query;
  const parsedCampaignId = parseRequiredId(campaignId, 'campaignId', res);
  if (parsedCampaignId === null) return;
  const parsedRoundNumber = parseRequiredId(roundNumber, 'roundNumber', res);
  if (parsedRoundNumber === null) return;

  const rows = db.prepare(
    'SELECT * FROM character_status WHERE campaign_id = ? AND round_number = ?'
  ).all(parsedCampaignId, parsedRoundNumber);

  const out = rows.map(row => {
    const card = db.prepare('SELECT code, class_name FROM character_card WHERE id = ?').get(row.character_card_id);
    return formatStatus(row, card);
  });

  res.json(out);
});

// 按角色+战役查所有状态
router.get('/character-campaign', (req, res) => {
  const db = getDb();
  const { characterCardId, campaignId } = req.query;
  const parsedCharacterCardId = parseRequiredId(characterCardId, 'characterCardId', res);
  if (parsedCharacterCardId === null) return;
  const parsedCampaignId = parseRequiredId(campaignId, 'campaignId', res);
  if (parsedCampaignId === null) return;

  const rows = db.prepare(
    'SELECT * FROM character_status WHERE character_card_id = ? AND campaign_id = ? ORDER BY round_number ASC'
  ).all(parsedCharacterCardId, parsedCampaignId);

  const card = db.prepare('SELECT code, class_name FROM character_card WHERE id = ?').get(parsedCharacterCardId);

  res.json(rows.map(row => formatStatus(row, card)));
});

function formatStatus(row, card) {
  return {
    id: row.id,
    characterCardId: row.character_card_id,
    characterCardCode: card?.code || null,
    characterCardClassName: card?.class_name || null,
    campaignId: row.campaign_id,
    roundNumber: row.round_number,
    currentMana: row.current_mana,
    manaLimit: row.mana_limit,
    currentCommandSeals: row.current_command_seals,
    statusEffects: row.status_effects,
    statusEffectsList: parseJson(row.status_effects_list, null),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseJson(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = router;
