const express = require('express');
const { getDb } = require('../db');
const { parseRequiredId } = require('../lib/validators');

const router = express.Router();

router.get('/', (req, res) => {
  const db = getDb();
  const { platform, guildId } = req.query;
  if (!platform || !guildId) {
    return res.status(400).json({ error: 'platform 和 guildId 不能为空' });
  }

  const row = db.prepare(`
    SELECT b.*, c.name AS campaign_name
    FROM qq_group_binding b
    LEFT JOIN campaign c ON c.id = b.campaign_id
    WHERE b.platform = ? AND b.guild_id = ?
    LIMIT 1
  `).get(String(platform), String(guildId));

  if (!row) return res.json(null);
  res.json(formatBinding(row));
});

router.post('/', (req, res) => {
  const db = getDb();
  const { platform, guildId, campaignId, groupName } = req.body || {};
  if (!platform || !guildId) {
    return res.status(400).json({ error: 'platform, guildId 不能为空' });
  }
  const parsedCampaignId = parseRequiredId(campaignId, 'campaignId', res);
  if (parsedCampaignId === null) return;

  const campaign = db.prepare('SELECT id, name FROM campaign WHERE id = ?').get(parsedCampaignId);
  if (!campaign) return res.status(404).json({ error: '未找到战役' });

  db.prepare(`
    INSERT INTO qq_group_binding (platform, guild_id, campaign_id, group_name)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(platform, guild_id) DO UPDATE SET
      campaign_id = excluded.campaign_id,
      group_name = excluded.group_name,
      updated_at = datetime('now')
  `).run(String(platform), String(guildId), parsedCampaignId, groupName || null);

  const row = db.prepare(`
    SELECT b.*, c.name AS campaign_name
    FROM qq_group_binding b
    LEFT JOIN campaign c ON c.id = b.campaign_id
    WHERE b.platform = ? AND b.guild_id = ?
    LIMIT 1
  `).get(String(platform), String(guildId));

  res.json(formatBinding(row));
});

function formatBinding(row) {
  return {
    id: row.id,
    platform: row.platform,
    guildId: row.guild_id,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name || null,
    groupName: row.group_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = router;
module.exports.formatBinding = formatBinding;
