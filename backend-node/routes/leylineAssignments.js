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
    'SELECT * FROM leyline_assignment WHERE campaign_id = ?'
  ).all(campaignId);

  res.json(rows.map(format));
});

// 分配单个
router.post('/', (req, res) => {
  const db = getDb();
  const { campaignId, leylineId, characterCardId } = req.body;
  const parsedCampaignId = parseRequiredId(campaignId, 'campaignId', res);
  if (parsedCampaignId === null) return;
  const parsedCharacterCardId = parseRequiredId(characterCardId, 'characterCardId', res);
  if (parsedCharacterCardId === null) return;

  // 先删除该角色已有的分配
  db.prepare('DELETE FROM leyline_assignment WHERE campaign_id = ? AND character_card_id = ?')
    .run(parsedCampaignId, parsedCharacterCardId);

  if (leylineId) {
    const parsedLeylineId = parseRequiredId(leylineId, 'leylineId', res);
    if (parsedLeylineId === null) return;
    const result = db.prepare(
      'INSERT INTO leyline_assignment (campaign_id, leyline_id, character_card_id) VALUES (?, ?, ?)'
    ).run(parsedCampaignId, parsedLeylineId, parsedCharacterCardId);

    const row = db.prepare('SELECT * FROM leyline_assignment WHERE id = ?').get(result.lastInsertRowid);
    return res.json(format(row));
  }

  res.json(null);
});

// 批量分配
router.post('/bulk', (req, res) => {
  const db = getDb();
  const { campaignId, items } = req.body;
  const parsedCampaignId = parseRequiredId(campaignId, 'campaignId', res);
  if (parsedCampaignId === null) return;

  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'items 必须是数组' });
  }

  const tx = db.transaction(() => {
    for (const item of items) {
      // 批量分配也要逐条检查，防止一个脏 ID 污染整张分配表。
      const characterCardId = Number(item.characterCardId);
      const leylineId = item.leylineId ? Number(item.leylineId) : null;
      if (!Number.isInteger(characterCardId) || characterCardId <= 0) {
        throw new Error('items.characterCardId 必须是正整数');
      }
      if (item.leylineId && (!Number.isInteger(leylineId) || leylineId <= 0)) {
        throw new Error('items.leylineId 必须是正整数');
      }

      db.prepare('DELETE FROM leyline_assignment WHERE campaign_id = ? AND character_card_id = ?')
        .run(parsedCampaignId, characterCardId);

      if (leylineId) {
        db.prepare(
          'INSERT INTO leyline_assignment (campaign_id, leyline_id, character_card_id) VALUES (?, ?, ?)'
        ).run(parsedCampaignId, leylineId, characterCardId);
      }
    }
  });

  try {
    tx();
  } catch (error) {
    return res.status(400).json({ error: error.message || '批量分配失败' });
  }
  res.json({ ok: true });
});

function format(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    leylineId: row.leyline_id,
    characterCardId: row.character_card_id,
  };
}

module.exports = router;
