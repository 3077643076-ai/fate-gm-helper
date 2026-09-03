const express = require('express');
const { getDb } = require('../db');
const { parseRequiredId } = require('../lib/validators');

const router = express.Router();

// SSE 连接池
const sseClients = new Map(); // campaignId -> Set<response>

// 御主槽位覆盖：御主职业名无法映射到从者阶职，这里按代号指定其所属阶职槽位
// （与前端 BattleControl.vue 的 MASTER_SLOT_OVERRIDES 保持一致）
const MASTER_SLOT_OVERRIDES = {
  '关羽': '狂',
  '曹丕': '弓',
  '曹植': '杀',
  '火焰驹': '骑',
  '左慈': '术',
  '荀彧': '枪',
  '阿斗': '剑',
};

// 从角色名/职业名映射到阶职
function mapClassNameToClass(className) {
  const text = String(className || '').toLowerCase()
  if (text.includes('archer') || text.includes('弓')) return '弓'
  if (text.includes('lancer') || text.includes('枪') || text.includes('槍')) return '枪'
  if (text.includes('assassin') || text.includes('杀')) return '杀'
  if (text.includes('rider') || text.includes('骑')) return '骑'
  if (text.includes('saber') || text.includes('剑')) return '剑'
  if (text.includes('caster') || text.includes('术')) return '术'
  if (text.includes('berserker') || text.includes('狂')) return '狂'
  return ''
}

// 角色卡 → 所属阶职槽位（从者按职介，御主按 override）
function getSlotClassForCard(card) {
  if (!card) return ''
  if (card.card_type === 'MASTER') {
    const ov = MASTER_SLOT_OVERRIDES[card.code]
    if (ov) return ov
  }
  return mapClassNameToClass(card.class_name)
}

// 从行动内容中解析灵脉目标，如 "降临-灵脉-B" / "降临 灵脉B" / "机动 灵脉 B"
function extractLeylineFromContent(content, db, campaignId) {
  const text = String(content || '')
  const match = text.match(/灵脉[\s\-－]?([A-Ja-j])/)
  if (!match) return null
  const letter = match[1].toUpperCase()
  const row = db.prepare(
    'SELECT id FROM leyline WHERE campaign_id = ? AND name LIKE ?'
  ).get(campaignId, `灵脉-${letter}%`)
  return row ? row.id : null
}

// 按阶职找到该槽位的从者卡和御主卡
function findCardsForClass(db, campaignId, cls) {
  const all = db.prepare(
    'SELECT * FROM character_card WHERE campaign_id = ?'
  ).all(campaignId)
  const servant = all.find(c => c.card_type === 'SERVANT' && getSlotClassForCard(c) === cls)
  const master = all.find(c => c.card_type === 'MASTER' && getSlotClassForCard(c) === cls)
  return { servant, master }
}

// 提交行动时，若内容含灵脉目标，自动把该阶职的从者+御主指派到目标灵脉
// 按行动类型区分移动：
//   机动/干涉/介入（含"降临"）→ 移动到目标灵脉
//   魂食 → 不移动（留在原地，人流量-1 由 GM 手动或后续结算处理）
function autoAssignLeylineFromSubmission(db, campaignId, servantClass, content, actionType) {
  const text = String(content || '')
  const leylineId = extractLeylineFromContent(text, db, campaignId)
  if (!leylineId) return

  // 判断是否为移动类行动
  const isSoulEat = text.includes('魂食')
  const isMove = !isSoulEat && (
    text.includes('机动') || text.includes('干涉') || text.includes('介入') || text.includes('降临')
  )
  if (!isMove) return // 魂食或其他非移动行动：不改变灵脉

  const { servant, master } = findCardsForClass(db, campaignId, servantClass)
  for (const card of [servant, master]) {
    if (!card) continue
    db.prepare('DELETE FROM leyline_assignment WHERE campaign_id = ? AND character_card_id = ?')
      .run(campaignId, card.id)
    db.prepare(
      'INSERT INTO leyline_assignment (campaign_id, leyline_id, character_card_id) VALUES (?, ?, ?)'
    ).run(campaignId, leylineId, card.id)
  }
}

// 提交行动
router.post('/', (req, res) => {
  const db = getDb();
  const { campaignId, servantClass, actionType, content, submittedBy } = req.body;
  const parsedCampaignId = parseRequiredId(campaignId, 'campaignId', res);
  if (parsedCampaignId === null) return;

  if (!servantClass || !actionType || !content) {
    return res.status(400).json({ error: 'servantClass, actionType, content 不能为空' });
  }

  // 获取或创建当前开放回合
  let round = db.prepare(
    "SELECT * FROM campaign_round WHERE campaign_id = ? AND status = 'OPEN' ORDER BY turn_number DESC LIMIT 1"
  ).get(parsedCampaignId);

  if (!round) {
    const last = db.prepare(
      'SELECT turn_number FROM campaign_round WHERE campaign_id = ? ORDER BY turn_number DESC LIMIT 1'
    ).get(parsedCampaignId);
    const nextTurn = last ? last.turn_number + 1 : 1;
    const r = db.prepare(
      "INSERT INTO campaign_round (campaign_id, turn_number, status) VALUES (?, ?, 'OPEN')"
    ).run(parsedCampaignId, nextTurn);
    round = db.prepare('SELECT * FROM campaign_round WHERE id = ?').get(r.lastInsertRowid);
  }

  // 清除旧记录
  db.prepare(
    'UPDATE action_submission SET is_current = 0 WHERE round_id = ? AND servant_class = ? AND action_type = ?'
  ).run(round.id, servantClass, actionType);

  // 插入新记录
  const result = db.prepare(`
    INSERT INTO action_submission (round_id, round_number, campaign_id, servant_class, action_type, content, submitted_by, is_current)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(round.id, round.turn_number, parsedCampaignId, servantClass, actionType, content, submittedBy || null);

  const row = db.prepare('SELECT * FROM action_submission WHERE id = ?').get(result.lastInsertRowid);
  const out = formatSubmission(row);

  // 若行动内容含灵脉目标（如"降临-灵脉-B"），自动把该阶职的从者+御主指派到目标灵脉
  // 机动/干涉/介入会移动，魂食不移动（人流量变化由 GM 手动调整）
  try {
    autoAssignLeylineFromSubmission(db, parsedCampaignId, servantClass, content, actionType)
  } catch (e) {
    console.error('[autoAssignLeyline] 失败:', e.message)
  }

  // 推送SSE
  notifySse(parsedCampaignId, out);

  res.json(out);
});

// 列表当前行动
router.get('/', (req, res) => {
  const db = getDb();
  const campaignId = parseRequiredId(req.query.campaignId, 'campaignId', res);
  if (campaignId === null) return;
  const rows = db.prepare(
    'SELECT * FROM action_submission WHERE campaign_id = ? AND is_current = 1'
  ).all(campaignId);

  res.json(rows.map(formatSubmission));
});

// SSE 流
router.get('/stream', (req, res) => {
  const campaignId = parseRequiredId(req.query.campaignId, 'campaignId', res);
  if (campaignId === null) return;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // 发送连接确认
  res.write('event: connected\ndata: connected\n\n');

  // 注册客户端
  if (!sseClients.has(campaignId)) sseClients.set(campaignId, new Set());
  sseClients.get(campaignId).add(res);

  // 清理
  req.on('close', () => {
    const clients = sseClients.get(campaignId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) sseClients.delete(campaignId);
    }
  });
});

function notifySse(campaignId, data) {
  const clients = sseClients.get(campaignId);
  if (!clients || clients.size === 0) return;

  const payload = `event: submission\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try { client.write(payload); } catch { clients.delete(client); }
  }
}

function formatSubmission(row) {
  return {
    id: row.id,
    roundId: row.round_id,
    roundNumber: row.round_number,
    campaignId: row.campaign_id,
    servantClass: row.servant_class,
    actionType: row.action_type,
    content: row.content,
    submittedBy: row.submitted_by,
    current: !!row.is_current,
    createdAt: row.created_at,
  };
}

module.exports = router;
