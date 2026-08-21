const express = require('express');
const { getDb } = require('../db');
const { parseRequiredId } = require('../lib/validators');

const router = express.Router();

// SSE 连接池
const sseClients = new Map(); // campaignId -> Set<response>

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
