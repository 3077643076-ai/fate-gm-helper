const express = require('express');
const { getDb } = require('../db');
const { parseRequiredId } = require('../lib/validators');

const router = express.Router();

// 获取当前开放回合
router.get('/current', (req, res) => {
  const db = getDb();
  const campaignId = parseRequiredId(req.query.campaignId, 'campaignId', res);
  if (campaignId === null) return;

  let round = db.prepare(
    'SELECT * FROM campaign_round WHERE campaign_id = ? AND status = ? ORDER BY turn_number DESC LIMIT 1'
  ).get(campaignId, 'OPEN');

  if (!round) {
    round = createNextRound(db, campaignId);
  }

  res.json({ round: formatRound(round) });
});

// 创建下一回合
router.post('/next', (req, res) => {
  const db = getDb();
  const campaignId = parseRequiredId(req.query.campaignId, 'campaignId', res);
  if (campaignId === null) return;
  const round = createNextRound(db, campaignId);
  res.json({ round: formatRound(round) });
});

// 关闭当前回合（只关闭锁定，不自动创建下一回合；由"进入下一回合"按钮推进）
router.post('/close-current', (req, res) => {
  const db = getDb();
  const campaignId = parseRequiredId(req.query.campaignId, 'campaignId', res);
  if (campaignId === null) return;
  const body = req.body || {};

  const round = db.prepare(
    "SELECT * FROM campaign_round WHERE campaign_id = ? AND status = 'OPEN' ORDER BY turn_number DESC LIMIT 1"
  ).get(campaignId);

  if (!round) {
    return res.status(400).json({ error: '当前战役没有处于开放状态的回合' });
  }

  db.prepare("UPDATE campaign_round SET status = 'CLOSED', closed_at = datetime('now') WHERE id = ?").run(round.id);

  const closed = db.prepare('SELECT * FROM campaign_round WHERE id = ?').get(round.id);
  const out = { round: formatRound(closed) };

  // 保存历史快照（如果有）
  if (body.actionOrder || body.servantActions || body.masterActions) {
    const result = db.prepare(`
      INSERT INTO action_history (campaign_id, round_number, closed_at, action_order, servant_actions, master_actions)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      campaignId, closed.turn_number, closed.closed_at,
      body.actionOrder ? JSON.stringify(body.actionOrder) : null,
      body.servantActions ? JSON.stringify(body.servantActions) : null,
      body.masterActions ? JSON.stringify(body.masterActions) : null,
    );

    const hist = db.prepare('SELECT * FROM action_history WHERE id = ?').get(result.lastInsertRowid);
    out.history = hist;
  }

  res.json(out);
});

// 回合历史
router.get('/history', (req, res) => {
  const db = getDb();
  const campaignId = parseRequiredId(req.query.campaignId, 'campaignId', res);
  if (campaignId === null) return;
  const rows = db.prepare(
    'SELECT * FROM action_history WHERE campaign_id = ? ORDER BY round_number DESC'
  ).all(campaignId);

  // 转成前端期望的驼峰字段（servantActions / masterActions / roundNumber / actionOrder）
  const out = rows.map(r => ({
    id: r.id,
    campaignId: r.campaign_id,
    roundNumber: r.round_number,
    closedAt: r.closed_at,
    actionOrder: r.action_order ? JSON.parse(r.action_order) : null,
    servantActions: r.servant_actions ? JSON.parse(r.servant_actions) : null,
    masterActions: r.master_actions ? JSON.parse(r.master_actions) : null,
    createdAt: r.created_at,
  }));
  res.json(out);
});

function createNextRound(db, campaignId) {
  const last = db.prepare(
    'SELECT turn_number FROM campaign_round WHERE campaign_id = ? ORDER BY turn_number DESC LIMIT 1'
  ).get(campaignId);

  const nextTurn = last ? last.turn_number + 1 : 1;

  const result = db.prepare(
    "INSERT INTO campaign_round (campaign_id, turn_number, status) VALUES (?, ?, 'OPEN')"
  ).run(campaignId, nextTurn);

  return db.prepare('SELECT * FROM campaign_round WHERE id = ?').get(result.lastInsertRowid);
}

function formatRound(r) {
  if (!r) return null;
  return {
    id: r.id,
    turnNumber: r.turn_number,
    status: r.status,
    createdAt: r.created_at,
    closedAt: r.closed_at,
  };
}

module.exports = router;
