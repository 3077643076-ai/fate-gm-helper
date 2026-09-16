// 技能提交记录路由
// 链路：玩家在 QQ 发文字 → Koishi 插件 POST 过来（或 GM 手动录入）→ 解析落库为 pending
// → GM 在确认页修正条目/段勾选 → confirm（顺手把新缩写存为别名）或 discard。

const express = require('express');
const { getDb } = require('../db');
const { parseSubmissionText, resolveSegmentsByEffect } = require('../lib/skillSubmissionParser');
const { parseRequiredId } = require('../lib/validators');

const router = express.Router();

// 解析结果转成可落库的条目（补充模板名快照，方便页面不查库也能显示）
// 匹配上模板的条目再做一次"段俗称匹配"：玩家写"丢群惩"自动勾中群惩罚段
function shapeItems(parsed, rawText, db) {
  return parsed.items.map(item => {
    resolveSegmentsByEffect(item, rawText, db);
    return {
      aliasText: item.aliasText,
      grade: item.grade || null,
      gradeAmbiguous: Boolean(item.gradeAmbiguous),
      segments: item.segments || null,
      templateId: item.templateId || null,
      templateName: item.templateName || null,
      matchType: item.matchType,
      candidates: item.candidates || [],
      duplicate: false,
    };
  });
}

// 统计某提交人（unit_key 优先，回退 qq_user）在本战役本回合已确认的同技能条目数
function countConfirmedUses(db, { campaignId, roundId, unitKey, qqUser, excludeSubmissionId }) {
  const rows = db.prepare(`
    SELECT id, round_id, unit_key, qq_user, items_json FROM skill_submission
    WHERE campaign_id = ? AND status = 'confirmed'
  `).all(campaignId);
  const counter = {};
  for (const row of rows) {
    if (excludeSubmissionId && row.id === excludeSubmissionId) continue;
    // 归属判断：两边都有 unit_key 用 unit_key；否则用 qq_user；对不上就跳过
    if (unitKey && row.unit_key) {
      if (row.unit_key !== unitKey) continue;
    } else if (qqUser && row.qq_user) {
      if (row.qq_user !== qqUser) continue;
    } else {
      continue;
    }
    if (row.round_id !== (roundId ?? null)) continue;
    for (const item of JSON.parse(row.items_json || '[]')) {
      if (item.templateId) counter[item.templateId] = (counter[item.templateId] || 0) + 1;
    }
  }
  return counter;
}

// 给条目打重复标记：已确认次数 + 本次确认顺序 超过模板每回合上限 → duplicate=true
function markDuplicates(db, submission) {
  const campaignId = submission.campaign_id;
  const roundId = submission.round_id ?? null;
  const unitKey = submission.unit_key || null;
  const qqUser = submission.qq_user || null;
  const confirmedBefore = countConfirmedUses(db, { campaignId, roundId, unitKey, qqUser, excludeSubmissionId: submission.id });

  const items = JSON.parse(submission.items_json || '[]');
  const perTemplateCount = { ...confirmedBefore };
  let hasDuplicate = false;
  for (const item of items) {
    if (!item.templateId) { item.duplicate = false; continue; }
    const tpl = db.prepare('SELECT max_uses_per_round FROM skill_template WHERE id = ?').get(item.templateId);
    const maxUses = tpl ? (tpl.max_uses_per_round ?? 1) : 1;
    perTemplateCount[item.templateId] = (perTemplateCount[item.templateId] || 0) + 1;
    // maxUses = 0 表示不限次数；否则累计次数超过上限即视为疑似重复
    item.duplicate = maxUses > 0 && perTemplateCount[item.templateId] > maxUses;
    if (item.duplicate) hasDuplicate = true;
  }
  return { items, hasDuplicate };
}

// 预览解析：不落库，给 GM 页面"先试试怎么解析"用
router.post('/preview', (req, res) => {
  const db = getDb();
  const { campaignId, text } = req.body || {};
  if (!campaignId) return res.status(400).json({ error: '缺少 campaignId' });
  if (!text || !String(text).trim()) return res.status(400).json({ error: '提交内容不能为空' });
  const parsed = parseSubmissionText(String(text), Number(campaignId), db);
  res.json({ items: shapeItems(parsed, String(text), db), unknownShards: parsed.unknownShards });
});

// 新建提交（Koishi 插件 / GM 页面都会用）
router.post('/', (req, res) => {
  const db = getDb();
  const { campaignId, roundId, qqUser, unitKey, text } = req.body || {};
  if (!campaignId) return res.status(400).json({ error: '缺少 campaignId' });
  if (!text || !String(text).trim()) return res.status(400).json({ error: '提交内容不能为空' });

  const parsed = parseSubmissionText(String(text), Number(campaignId), db);
  const items = shapeItems(parsed, String(text), db);

  const result = db.prepare(`
    INSERT INTO skill_submission (campaign_id, round_id, qq_user, unit_key, raw_text, items_json, status, has_duplicate)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', 0)
  `).run(
    Number(campaignId),
    roundId ? Number(roundId) : null,
    qqUser ? String(qqUser) : null,
    unitKey ? String(unitKey) : null,
    String(text),
    JSON.stringify(items),
  );

  const row = db.prepare('SELECT * FROM skill_submission WHERE id = ?').get(result.lastInsertRowid);
  res.json(formatRow(row));
});

// 列表：按战役/状态过滤，待确认的排前面、新的排前面
router.get('/', (req, res) => {
  const db = getDb();
  const { campaignId = '', status = '' } = req.query;
  const params = [];
  let where = 'WHERE 1=1';
  if (campaignId) { where += ' AND campaign_id = ?'; params.push(Number(campaignId)); }
  if (status) { where += ' AND status = ?'; params.push(String(status)); }
  const rows = db.prepare(`
    SELECT * FROM skill_submission ${where}
    ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, id DESC
    LIMIT 200
  `).all(...params);
  res.json({ content: rows.map(formatRow), totalElements: rows.length });
});

// 详情
router.get('/:id', (req, res) => {
  const db = getDb();
  const id = parseRequiredId(req.params.id, 'id', res);
  if (id === null) return;
  const row = db.prepare('SELECT * FROM skill_submission WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '未找到提交记录' });
  res.json(formatRow(row));
});

// GM 修正条目（换模板 / 改段勾选 / 改等级），只允许改 pending 状态
router.put('/:id/items', (req, res) => {
  const db = getDb();
  const id = parseRequiredId(req.params.id, 'id', res);
  if (id === null) return;
  const row = db.prepare('SELECT * FROM skill_submission WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '未找到提交记录' });
  if (row.status !== 'pending') return res.status(400).json({ error: '已确认/已丢弃的记录不能修改' });
  const { items } = req.body || {};
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items 必须是数组' });
  db.prepare("UPDATE skill_submission SET items_json = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(items), id);
  const fresh = db.prepare('SELECT * FROM skill_submission WHERE id = ?').get(id);
  res.json(formatRow(fresh));
});

// 确认：重打重复标记 → 存别名 → 状态改 confirmed
router.post('/:id/confirm', (req, res) => {
  const db = getDb();
  const id = parseRequiredId(req.params.id, 'id', res);
  if (id === null) return;
  const row = db.prepare('SELECT * FROM skill_submission WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '未找到提交记录' });
  if (row.status !== 'pending') return res.status(400).json({ error: '该记录已处理过' });

  const { items: fixedItems, saveAliases } = req.body || {};
  let working = row;
  if (Array.isArray(fixedItems)) {
    db.prepare("UPDATE skill_submission SET items_json = ?, updated_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify(fixedItems), id);
    working = db.prepare('SELECT * FROM skill_submission WHERE id = ?').get(id);
  }

  // 确认时刻重新判定重复（此时能看见之前已确认的记录）
  const { items, hasDuplicate } = markDuplicates(db, working);
  db.prepare("UPDATE skill_submission SET items_json = ?, has_duplicate = ?, status = 'confirmed', confirmed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(items), hasDuplicate ? 1 : 0, id);

  // 顺手存别名：GM 勾了"记住这个缩写"的条目 → 写入 skill_alias（下次直接命中）
  const savedAliases = [];
  for (const aliasText of Array.isArray(saveAliases) ? saveAliases : []) {
    const item = items.find(i => i.aliasText === aliasText);
    if (!item || !item.templateId || !item.aliasText) continue;
    const exists = db.prepare(
      'SELECT id FROM skill_alias WHERE alias_text = ? AND template_id = ? AND campaign_id IS ?'
    ).get(item.aliasText, item.templateId, working.campaign_id);
    if (exists) continue;
    db.prepare("INSERT INTO skill_alias (alias_text, template_id, campaign_id, source) VALUES (?, ?, ?, 'submission')")
      .run(item.aliasText, item.templateId, working.campaign_id);
    savedAliases.push(item.aliasText);
  }

  const fresh = db.prepare('SELECT * FROM skill_submission WHERE id = ?').get(id);
  res.json({ ...formatRow(fresh), savedAliases });
});

// 丢弃（玩家手滑多发、整条不认）
router.post('/:id/discard', (req, res) => {
  const db = getDb();
  const id = parseRequiredId(req.params.id, 'id', res);
  if (id === null) return;
  const row = db.prepare('SELECT * FROM skill_submission WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '未找到提交记录' });
  if (row.status !== 'pending') return res.status(400).json({ error: '该记录已处理过' });
  db.prepare("UPDATE skill_submission SET status = 'discarded', updated_at = datetime('now') WHERE id = ?").run(id);
  const fresh = db.prepare('SELECT * FROM skill_submission WHERE id = ?').get(id);
  res.json(formatRow(fresh));
});

// 删除记录（确认错了也能彻底删掉重来）
router.delete('/:id', (req, res) => {
  const db = getDb();
  const id = parseRequiredId(req.params.id, 'id', res);
  if (id === null) return;
  db.prepare('DELETE FROM skill_submission WHERE id = ?').run(id);
  res.status(204).end();
});

// 行 → 前端格式
function formatRow(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    roundId: row.round_id,
    qqUser: row.qq_user,
    unitKey: row.unit_key,
    rawText: row.raw_text,
    items: JSON.parse(row.items_json || '[]'),
    status: row.status,
    hasDuplicate: Boolean(row.has_duplicate),
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = router;
