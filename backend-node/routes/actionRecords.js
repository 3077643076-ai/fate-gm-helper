const express = require('express');
const { getDb } = require('../db');
const { parseRequiredId } = require('../lib/validators');

const router = express.Router();

const PERIODS = new Set(['JUMP', 'DAY', 'NIGHT']);
const ROLES = new Set(['SERVANT', 'MASTER']);

// 列出战役的全部手动行动记录
router.get('/', (req, res) => {
  const db = getDb();
  const campaignId = parseRequiredId(req.query.campaignId, 'campaignId', res);
  if (campaignId === null) return;

  const rows = db.prepare(
    'SELECT * FROM action_record WHERE campaign_id = ? ORDER BY day ASC, period ASC, servant_class ASC, role ASC'
  ).all(campaignId);

  res.json(rows.map(formatRecord));
});

// 批量保存（upsert）行动记录格子
// body: { campaignId, records: [{ day, period, servantClass, role, content }] }
// 内容为空 → 删除该格记录（让显示回退到历史快照）
router.put('/', (req, res) => {
  const db = getDb();
  const campaignId = parseRequiredId(req.body.campaignId, 'campaignId', res);
  if (campaignId === null) return;

  const records = Array.isArray(req.body.records) ? req.body.records : [];
  if (records.length === 0) {
    return res.status(400).json({ error: 'records 不能为空数组' });
  }

  // 校验每条记录
  for (const r of records) {
    const day = Number(r.day);
    if (!Number.isInteger(day) || day < 0 || day > 14) {
      return res.status(400).json({ error: `day 非法: ${r.day}（应为 0~14）` });
    }
    if (!PERIODS.has(r.period)) {
      return res.status(400).json({ error: `period 非法: ${r.period}（应为 JUMP/DAY/NIGHT）` });
    }
    if (!r.servantClass || !String(r.servantClass).trim()) {
      return res.status(400).json({ error: 'servantClass 不能为空' });
    }
    if (!ROLES.has(r.role)) {
      return res.status(400).json({ error: `role 非法: ${r.role}（应为 SERVANT/MASTER）` });
    }
  }

  const upsert = db.prepare(`
    INSERT INTO action_record (campaign_id, day, period, servant_class, role, content, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(campaign_id, day, period, servant_class, role)
    DO UPDATE SET content = excluded.content, updated_at = datetime('now')
  `);
  const remove = db.prepare(
    'DELETE FROM action_record WHERE campaign_id = ? AND day = ? AND period = ? AND servant_class = ? AND role = ?'
  );

  const saveAll = db.transaction(() => {
    let saved = 0;
    let removed = 0;
    for (const r of records) {
      const content = String(r.content == null ? '' : r.content).trim();
      if (content === '') {
        const info = remove.run(campaignId, Number(r.day), r.period, String(r.servantClass).trim(), r.role);
        removed += info.changes;
      } else {
        upsert.run(campaignId, Number(r.day), r.period, String(r.servantClass).trim(), r.role, content);
        saved += 1;
      }
    }
    return { saved, removed };
  });

  const result = saveAll();
  const rows = db.prepare(
    'SELECT * FROM action_record WHERE campaign_id = ? ORDER BY day ASC, period ASC, servant_class ASC, role ASC'
  ).all(campaignId);

  res.json({ saved: result.saved, removed: result.removed, records: rows.map(formatRecord) });
});

function formatRecord(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    day: row.day,
    period: row.period,
    servantClass: row.servant_class,
    role: row.role,
    content: row.content,
    updatedAt: row.updated_at,
  };
}

module.exports = router;
