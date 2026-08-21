const express = require('express');
const { getDb } = require('../db');
const { parseRequiredId } = require('../lib/validators');

const router = express.Router();

// 列表
router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM campaign ORDER BY created_at DESC').all();
  res.json(rows);
});

// 获取已选择战役（必须在 /:id 之前）
router.get('/selected', (req, res) => {
  const db = getDb();
  const row = db.prepare("SELECT setting_value FROM app_settings WHERE setting_key = 'selected_campaign'").get();
  if (!row || !row.setting_value) return res.json({ id: null, name: null });

  const campaign = db.prepare('SELECT id, name FROM campaign WHERE id = ?').get(Number(row.setting_value));
  if (!campaign) return res.json({ id: null, name: null });
  res.json(campaign);
});

// 详情
router.get('/:id', (req, res) => {
  const db = getDb();
  const id = parseRequiredId(req.params.id, 'id', res);
  if (id === null) return;
  const row = db.prepare('SELECT * FROM campaign WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '未找到战役' });
  res.json(row);
});

// 创建
router.post('/', (req, res) => {
  const db = getDb();
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: '名称不能为空' });
  const result = db.prepare('INSERT INTO campaign (name, description) VALUES (?, ?)').run(name, description || null);
  const row = db.prepare('SELECT * FROM campaign WHERE id = ?').get(result.lastInsertRowid);
  res.json(row);
});

// 删除
router.delete('/:id', (req, res) => {
  const db = getDb();
  const id = parseRequiredId(req.params.id, 'id', res);
  if (id === null) return;

  const tx = db.transaction(() => {
    const selected = db.prepare("SELECT setting_value FROM app_settings WHERE setting_key = 'selected_campaign'").get();
    if (selected && Number(selected.setting_value) === id) {
      db.prepare("DELETE FROM app_settings WHERE setting_key = 'selected_campaign'").run();
    }

    db.prepare('DELETE FROM action_submission WHERE campaign_id = ?').run(id);
    db.prepare('DELETE FROM battle_review_snapshot WHERE campaign_id = ?').run(id);
    db.prepare('DELETE FROM battle_sheet WHERE campaign_id = ?').run(id);
    db.prepare('DELETE FROM character_status WHERE campaign_id = ?').run(id);
    db.prepare('DELETE FROM qq_group_binding WHERE campaign_id = ?').run(id);
    db.prepare('DELETE FROM leyline_assignment WHERE campaign_id = ?').run(id);
    db.prepare('DELETE FROM leyline WHERE campaign_id = ?').run(id);
    db.prepare('DELETE FROM action_history WHERE campaign_id = ?').run(id);
    db.prepare('DELETE FROM campaign_round WHERE campaign_id = ?').run(id);
    db.prepare('DELETE FROM character_card WHERE campaign_id = ?').run(id);
    db.prepare('DELETE FROM campaign WHERE id = ?').run(id);
  });

  tx();
  res.json({ ok: true });
});

// 选择战役
router.post('/:id/select', (req, res) => {
  const db = getDb();
  const id = parseRequiredId(req.params.id, 'id', res);
  if (id === null) return;

  db.prepare("INSERT INTO app_settings (setting_key, setting_value) VALUES ('selected_campaign', ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = ?, updated_at = datetime('now')").run(String(id), String(id));

  res.json({ ok: true });
});

module.exports = router;
