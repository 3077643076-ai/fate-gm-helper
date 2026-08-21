const express = require('express');
const { getDb } = require('../db');
const {
  normalizeSkillTemplatePayload,
  formatSkillTemplateRow,
} = require('../lib/skillTemplateNormalizer');
const { parseRequiredId } = require('../lib/validators');

const router = express.Router();

router.get('/', (req, res) => {
  const db = getDb();
  const { page = 0, size = 50, keyword = '', timing = '' } = req.query;
  const params = [];
  let where = 'WHERE 1=1';

  if (keyword.trim()) {
    where += " AND (LOWER(name) LIKE LOWER(?) OR LOWER(COALESCE(raw_text, '')) LIKE LOWER(?))";
    const k = `%${keyword.trim()}%`;
    params.push(k, k);
  }

  if (timing.trim()) {
    where += ' AND timing = ?';
    params.push(timing.trim());
  }

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM skill_template ${where}`).get(...params);
  const limit = Math.max(1, Number(size) || 50);
  const offset = Math.max(0, Number(page) || 0) * limit;
  const rows = db.prepare(`
    SELECT * FROM skill_template
    ${where}
    ORDER BY updated_at DESC, created_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({
    content: rows.map(formatSkillTemplateRow),
    totalElements: total,
    totalPages: Math.ceil(total / limit),
    number: Number(page) || 0,
    size: limit,
  });
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const id = parseRequiredId(req.params.id, 'id', res);
  if (id === null) return;
  const row = db.prepare('SELECT * FROM skill_template WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '未找到技能模板' });
  res.json(formatSkillTemplateRow(row));
});

router.post('/', (req, res) => {
  const db = getDb();
  const payload = normalizeSkillTemplatePayload(req.body || {});
  if (!payload.name) return res.status(400).json({ error: '技能名不能为空' });

  const result = db.prepare(`
    INSERT INTO skill_template (
      name, rank, skill_type, timing, position_limit,
      mana_cost, cooldown, stat_modifiers,
      win_rate_modifier, enemy_win_rate_modifier,
      status_effects, effects_json, conditions_json, manual_judgment,
      source_book, source_section, raw_text, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.name,
    payload.rank,
    payload.skillType,
    payload.timing,
    payload.positionLimit,
    payload.manaCost,
    payload.cooldown,
    payload.statModifiers,
    payload.winRateModifier,
    payload.enemyWinRateModifier,
    payload.statusEffects,
    payload.effectsJson,
    payload.conditionsJson,
    payload.manualJudgment,
    payload.sourceBook,
    payload.sourceSection,
    payload.rawText,
    payload.notes,
  );

  const row = db.prepare('SELECT * FROM skill_template WHERE id = ?').get(result.lastInsertRowid);
  res.json(formatSkillTemplateRow(row));
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const id = parseRequiredId(req.params.id, 'id', res);
  if (id === null) return;
  const existing = db.prepare('SELECT * FROM skill_template WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '未找到技能模板' });

  const payload = normalizeSkillTemplatePayload(req.body || {});
  if (!payload.name) return res.status(400).json({ error: '技能名不能为空' });

  db.prepare(`
    UPDATE skill_template SET
      name = ?,
      rank = ?,
      skill_type = ?,
      timing = ?,
      position_limit = ?,
      mana_cost = ?,
      cooldown = ?,
      stat_modifiers = ?,
      win_rate_modifier = ?,
      enemy_win_rate_modifier = ?,
      status_effects = ?,
      effects_json = ?,
      conditions_json = ?,
      manual_judgment = ?,
      source_book = ?,
      source_section = ?,
      raw_text = ?,
      notes = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    payload.name,
    payload.rank,
    payload.skillType,
    payload.timing,
    payload.positionLimit,
    payload.manaCost,
    payload.cooldown,
    payload.statModifiers,
    payload.winRateModifier,
    payload.enemyWinRateModifier,
    payload.statusEffects,
    payload.effectsJson,
    payload.conditionsJson,
    payload.manualJudgment,
    payload.sourceBook,
    payload.sourceSection,
    payload.rawText,
    payload.notes,
    id,
  );

  const row = db.prepare('SELECT * FROM skill_template WHERE id = ?').get(id);
  res.json(formatSkillTemplateRow(row));
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const id = parseRequiredId(req.params.id, 'id', res);
  if (id === null) return;
  db.prepare('DELETE FROM skill_template WHERE id = ?').run(id);
  res.status(204).end();
});

module.exports = router;
