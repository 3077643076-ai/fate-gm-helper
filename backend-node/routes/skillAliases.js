// 技能别名路由：维护"玩家缩写 → 技能模板"映射表
// 例："空花" → 空中花园·XX，"魔境" → 魔境·XX
// campaign_id 为空表示全局别名（所有战役通用），填了表示只在该战役生效。

const express = require('express');
const { getDb } = require('../db');
const { parseRequiredId } = require('../lib/validators');

const router = express.Router();

// 列表：全局别名 + 可选的战役专属别名
router.get('/', (req, res) => {
  const db = getDb();
  const { campaignId = '' } = req.query;
  const params = [];
  let where = 'WHERE 1=1';
  if (campaignId) {
    where += ' AND (campaign_id IS NULL OR campaign_id = ?)';
    params.push(Number(campaignId));
  }
  const rows = db.prepare(`
    SELECT a.id, a.alias_text, a.template_id, a.campaign_id, a.source, a.created_at,
           t.name AS template_name
    FROM skill_alias a
    LEFT JOIN skill_template t ON t.id = a.template_id
    ${where}
    ORDER BY a.alias_text
  `).all(...params);
  res.json({
    content: rows.map(row => ({
      id: row.id,
      aliasText: row.alias_text,
      templateId: row.template_id,
      templateName: row.template_name,
      campaignId: row.campaign_id,
      global: row.campaign_id === null,
      source: row.source,
      createdAt: row.created_at,
    })),
    totalElements: rows.length,
  });
});

// 新增/更新别名：同一作用域（战役/全局）下同缩写换目标 = 覆盖旧指向（最新意图优先）
router.post('/', (req, res) => {
  const db = getDb();
  const { aliasText, templateId, campaignId } = req.body || {};
  const alias = String(aliasText || '').trim();
  if (!alias) return res.status(400).json({ error: '别名不能为空' });
  const tplId = Number(templateId);
  if (!tplId) return res.status(400).json({ error: '缺少 templateId' });
  const tpl = db.prepare('SELECT id FROM skill_template WHERE id = ?').get(tplId);
  if (!tpl) return res.status(404).json({ error: '未找到技能模板' });
  const scopeCampaignId = campaignId ? Number(campaignId) : null;

  // 同缩写同作用域已指向别的模板 → 覆盖
  const existing = db.prepare(
    'SELECT id FROM skill_alias WHERE alias_text = ? AND campaign_id IS ?'
  ).get(alias, scopeCampaignId);
  if (existing) {
    db.prepare("UPDATE skill_alias SET template_id = ?, source = 'manual', created_at = datetime('now') WHERE id = ?")
      .run(tplId, existing.id);
    const row = db.prepare('SELECT * FROM skill_alias WHERE id = ?').get(existing.id);
    return res.json({ ...formatRow(row), replaced: true });
  }

  const result = db.prepare("INSERT INTO skill_alias (alias_text, template_id, campaign_id, source) VALUES (?, ?, ?, 'manual')")
    .run(alias, tplId, scopeCampaignId);
  const row = db.prepare('SELECT * FROM skill_alias WHERE id = ?').get(result.lastInsertRowid);
  res.json(formatRow(row));
});

// 删除别名
router.delete('/:id', (req, res) => {
  const db = getDb();
  const id = parseRequiredId(req.params.id, 'id', res);
  if (id === null) return;
  db.prepare('DELETE FROM skill_alias WHERE id = ?').run(id);
  res.status(204).end();
});

function formatRow(row) {
  return {
    id: row.id,
    aliasText: row.alias_text,
    templateId: row.template_id,
    campaignId: row.campaign_id,
    global: row.campaign_id === null,
    source: row.source,
    createdAt: row.created_at,
  };
}

module.exports = router;
