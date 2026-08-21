const express = require('express');
const { getDb } = require('../db');
const { parseRequiredId } = require('../lib/validators');

const router = express.Router();

// 列表
router.get('/', (req, res) => {
  const db = getDb();
  const campaignId = parseRequiredId(req.query.campaignId, 'campaignId', res);
  if (campaignId === null) return;
  const rows = db.prepare(
    'SELECT * FROM leyline WHERE campaign_id = ? ORDER BY id ASC'
  ).all(campaignId);

  const out = rows.map(row => ({
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    effect: row.effect,
    description: row.description,
    manaAmount: row.mana_amount,
    battlefieldWidth: row.battlefield_width,
    populationFlow: row.population_flow,
    assignedCharacterIds: parseJson(row.assigned_character_ids, []),
  }));

  res.json(out);
});

// 创建
router.post('/', (req, res) => {
  const db = getDb();
  const { campaignId, name, manaAmount, battlefieldWidth, populationFlow, effect, description, assignedCharacterIds } = req.body;
  const parsedCampaignId = parseRequiredId(campaignId, 'campaignId', res);
  if (parsedCampaignId === null) return;
  if (!name || String(name).trim() === '') return res.status(400).json({ error: '灵脉名称不能为空' });

  const result = db.prepare(`
    INSERT INTO leyline (campaign_id, name, mana_amount, battlefield_width, population_flow, effect, description, assigned_character_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    parsedCampaignId, name, manaAmount || 0, battlefieldWidth || 0, populationFlow || 0,
    effect || null, description || null,
    assignedCharacterIds ? JSON.stringify(assignedCharacterIds) : null,
  );

  const row = db.prepare('SELECT * FROM leyline WHERE id = ?').get(result.lastInsertRowid);
  res.json(formatLeyline(row));
});

// 更新
router.put('/:id', (req, res) => {
  const db = getDb();
  const id = parseRequiredId(req.params.id, 'id', res);
  if (id === null) return;
  const { campaignId, name, manaAmount, battlefieldWidth, populationFlow, effect, description, assignedCharacterIds } = req.body;
  const parsedCampaignId = parseRequiredId(campaignId, 'campaignId', res);
  if (parsedCampaignId === null) return;
  if (!name || String(name).trim() === '') return res.status(400).json({ error: '灵脉名称不能为空' });

  db.prepare(`
    UPDATE leyline SET
      campaign_id = ?, name = ?, mana_amount = ?, battlefield_width = ?, population_flow = ?,
      effect = ?, description = ?, assigned_character_ids = ?
    WHERE id = ?
  `).run(
    parsedCampaignId, name, manaAmount || 0, battlefieldWidth || 0, populationFlow || 0,
    effect || null, description || null,
    assignedCharacterIds ? JSON.stringify(assignedCharacterIds) : null,
    id,
  );

  const row = db.prepare('SELECT * FROM leyline WHERE id = ?').get(id);
  res.json(formatLeyline(row));
});

// 删除
router.delete('/:id', (req, res) => {
  const db = getDb();
  const id = parseRequiredId(req.params.id, 'id', res);
  if (id === null) return;
  db.prepare('DELETE FROM leyline_assignment WHERE leyline_id = ?').run(id);
  db.prepare('DELETE FROM leyline WHERE id = ?').run(id);
  res.json({ ok: true });
});

function formatLeyline(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    effect: row.effect,
    description: row.description,
    manaAmount: row.mana_amount,
    battlefieldWidth: row.battlefield_width,
    populationFlow: row.population_flow,
    assignedCharacterIds: parseJson(row.assigned_character_ids, []),
  };
}

function parseJson(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = router;
