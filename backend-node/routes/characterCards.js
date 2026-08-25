const express = require('express');
const { getDb } = require('../db');
const { parseRequiredId } = require('../lib/validators');
const { validateCharacterCard } = require('../lib/characterCardValidator');

const router = express.Router();

// 对前端传来的未保存卡片做一次体检，方便保存前发现属性/RP/宝具值问题。
router.post('/validate', (req, res) => {
  res.json(validateCharacterCard(req.body || {}));
});

// 创建
router.post('/', (req, res) => {
  const db = getDb();
  const {
    code, className, rawText, cardType, campaignId,
    totalStats, baseStats, correctionStats,
    classSkills, personalSkills, noblePhantasms,
    workshops, craftEssences,
  } = req.body;
  const parsedCampaignId = campaignId ? parseRequiredId(campaignId, 'campaignId', res) : null;
  if (campaignId && parsedCampaignId === null) return;

  const result = db.prepare(`
    INSERT INTO character_card (
      code, class_name, raw_text, card_type, campaign_id,
      total_level, total_strength, total_endurance, total_agility, total_mana, total_luck, total_noble_phantasm,
      base_level, base_strength, base_endurance, base_agility, base_mana, base_luck, base_noble_phantasm,
      corr_level, corr_strength, corr_endurance, corr_agility, corr_mana, corr_luck, corr_noble_phantasm,
      class_skills, personal_skills, noble_phantasms, workshops, craft_essences
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `).run(
    code || null, className || null, rawText || null, cardType || 'SERVANT', parsedCampaignId,
    totalStats?.level || 0, totalStats?.strength || 0, totalStats?.endurance || 0, totalStats?.agility || 0, totalStats?.mana || 0, totalStats?.luck || 0, totalStats?.noblePhantasm || 0,
    baseStats?.level || 0, baseStats?.strength || 0, baseStats?.endurance || 0, baseStats?.agility || 0, baseStats?.mana || 0, baseStats?.luck || 0, baseStats?.noblePhantasm || 0,
    correctionStats?.level || 0, correctionStats?.strength || 0, correctionStats?.endurance || 0, correctionStats?.agility || 0, correctionStats?.mana || 0, correctionStats?.luck || 0, correctionStats?.noblePhantasm || 0,
    classSkills ? JSON.stringify(classSkills) : null,
    personalSkills ? JSON.stringify(personalSkills) : null,
    noblePhantasms ? JSON.stringify(noblePhantasms) : null,
    workshops ? JSON.stringify(workshops) : null,
    craftEssences ? JSON.stringify(craftEssences) : null,
  );

  const row = formatCard(db.prepare('SELECT * FROM character_card WHERE id = ?').get(result.lastInsertRowid));
  res.json(row);
});

// 详情
router.get('/:id', (req, res) => {
  const db = getDb();
  const id = parseRequiredId(req.params.id, 'id', res);
  if (id === null) return;
  const row = db.prepare('SELECT * FROM character_card WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '未找到角色卡' });
  res.json(formatCard(row));
});

// 对数据库里已经保存的卡片做体检。
router.get('/:id/validate', (req, res) => {
  const db = getDb();
  const id = parseRequiredId(req.params.id, 'id', res);
  if (id === null) return;
  const row = db.prepare('SELECT * FROM character_card WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '未找到角色卡' });
  res.json(validateCharacterCard(formatCard(row)));
});

// 列表/搜索
router.get('/', (req, res) => {
  const db = getDb();
  const { page = 0, size = 20, keyword, campaignId } = req.query;

  let sql = 'SELECT * FROM character_card WHERE 1=1';
  const params = [];

  if (campaignId) {
    const parsedCampaignId = parseRequiredId(campaignId, 'campaignId', res);
    if (parsedCampaignId === null) return;
    sql += ' AND campaign_id = ?';
    params.push(parsedCampaignId);
  }
  if (keyword && keyword.trim()) {
    sql += ' AND (code LIKE ? OR class_name LIKE ? OR raw_text LIKE ?)';
    const k = `%${keyword.trim()}%`;
    params.push(k, k, k);
  }

  // 总数
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
  const { total } = db.prepare(countSql).get(...params);

  // 分页
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(size), Number(page) * Number(size));

  const rows = db.prepare(sql).all(...params).map(formatCard);

  res.json({
    content: rows,
    totalElements: total,
    totalPages: Math.ceil(total / Number(size)),
    number: Number(page),
    size: Number(size),
  });
});

// 删除
router.delete('/:id', (req, res) => {
  const db = getDb();
  const id = parseRequiredId(req.params.id, 'id', res);
  if (id === null) return;
  db.prepare('DELETE FROM character_card WHERE id = ?').run(id);
  res.json({ ok: true });
});

// 退场
router.put('/:id/retire', (req, res) => {
  const db = getDb();
  const id = parseRequiredId(req.params.id, 'id', res);
  if (id === null) return;
  db.prepare('UPDATE character_card SET retired = 1 WHERE id = ?').run(id);
  res.json({ ok: true });
});

// 恢复退场
router.put('/:id/unretire', (req, res) => {
  const db = getDb();
  const id = parseRequiredId(req.params.id, 'id', res);
  if (id === null) return;
  db.prepare('UPDATE character_card SET retired = 0 WHERE id = ?').run(id);
  res.json({ ok: true });
});

// 将数据库行转为前端格式
function formatCard(row) {
  if (!row) return null;
  const parseJson = (str) => {
    if (!str) return [];
    try { return JSON.parse(str); } catch { return []; }
  };

  return {
    id: row.id,
    code: row.code,
    className: row.class_name,
    rawText: row.raw_text,
    cardType: row.card_type,
    campaignId: row.campaign_id,
    retired: !!row.retired,
    createdAt: row.created_at,
    totalStats: {
      level: row.total_level, strength: row.total_strength, endurance: row.total_endurance,
      agility: row.total_agility, mana: row.total_mana, luck: row.total_luck, noblePhantasm: row.total_noble_phantasm,
    },
    baseStats: {
      level: row.base_level, strength: row.base_strength, endurance: row.base_endurance,
      agility: row.base_agility, mana: row.base_mana, luck: row.base_luck, noblePhantasm: row.base_noble_phantasm,
    },
    correctionStats: {
      level: row.corr_level, strength: row.corr_strength, endurance: row.corr_endurance,
      agility: row.corr_agility, mana: row.corr_mana, luck: row.corr_luck, noblePhantasm: row.corr_noble_phantasm,
    },
    classSkills: parseJson(row.class_skills),
    personalSkills: parseJson(row.personal_skills),
    noblePhantasms: parseJson(row.noble_phantasms),
    workshops: parseJson(row.workshops),
    craftEssences: parseJson(row.craft_essences),
  };
}

module.exports = router;
