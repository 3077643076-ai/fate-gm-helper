// 一次性导入脚本：把三国杯备份里的历史记录进库（跑完归档）
// 来源：data/legacy-import/1.15/（从备份 zip 解出）
// 导入内容：
//   1. campaign_round 重建：turn1=跳伞(closed) turn2=第1天昼(closed) turn3=第1天夜(closed)
//      turn4=第2天昼(closed) turn5=第2天夜(OPEN，正在收)
//   2. action_history：turn1 跳伞落点快照、turn2/turn3 第1天昼/夜行动快照（解析自结算记录 md）
//   3. message_log：群聊记录 2693 条（含群号/群名/昵称/内容）
//   4. data/magic-transfers.jsonl 追加历史魔力转让 3 条
import Database from 'better-sqlite3';
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const db = new Database(join(root, 'data', 'gm_helper.db'));
db.pragma('journal_mode = WAL');
const legacyDir = join(root, 'data', 'legacy-import', '1.15');
const CAMPAIGN_ID = 999002;

// UTC ISO 时间 → 本地（UTC+8）"YYYY-MM-DD HH:MM:SS"
function toLocal(ts) {
  const d = new Date(ts);
  const local = new Date(d.getTime() + 8 * 3600 * 1000);
  return local.toISOString().replace('T', ' ').slice(0, 19);
}

// ---------- 1. 解析记录文件 ----------

// 1a. 结算记录 md：第1天昼/夜的行动提交表
// 注意 section 内还有魔力池等表格，行动表固定在"### 行动提交"小节里，需二次切分
const settleMd = readFileSync(join(legacyDir, '三国杯结算记录-第1天.md'), 'utf8');
function parseActionTable(sectionText) {
  const rows = [];
  for (const line of sectionText.split(/\r?\n/)) {
    const m = line.match(/^\|\s*([弓枪骑剑杀术狂])\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/);
    if (m) rows.push({ servantClass: m[1], servant: m[2], master: m[3] });
  }
  return rows;
}
function extractActionRows(sectionText) {
  const afterSubmit = sectionText.split(/###\s*行动提交/)[1] || '';
  return parseActionTable(afterSubmit.split(/\n###\s/)[0] || '');
}
const daySection = settleMd.split(/##\s*一、第1天昼/)[1]?.split(/##\s*二、第1天夜/)[0] || '';
const nightSection = settleMd.split(/##\s*二、第1天夜/)[1]?.split(/##\s*三、/)[0] || '';
const dayActions = extractActionRows(daySection);
const nightActions = extractActionRows(nightSection);
console.log(`[md] 第1天昼行动 ${dayActions.length} 组，第1天夜行动 ${nightActions.length} 组`);
if (dayActions.length !== 7 || nightActions.length !== 7) {
  console.error('[md] 组数不是 7，解析有误，中止导入（防止脏数据入库）');
  process.exit(1);
}

// 1b. 说明 md：跳伞落点表（职介/从者/御主/从者代号/御主代号/落点）
const introMd = readFileSync(join(legacyDir, '三国杯说明.md'), 'utf8');
const jumpRows = [];
for (const line of introMd.split(/\r?\n/)) {
  const m = line.match(/^\|\s*([弓枪骑剑杀术狂])\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/);
  if (m) jumpRows.push({ cls: m[1], servant: m[2], master: m[3], servantCode: m[4], masterCode: m[5], drop: m[6] });
}
console.log(`[md] 跳伞落点 ${jumpRows.length} 组`);

// 1c. 群聊记录 jsonl
const chatLines = readFileSync(join(legacyDir, '群聊记录-三国杯.jsonl'), 'utf8')
  .split(/\r?\n/).filter(Boolean);
const chatRows = chatLines.map(l => JSON.parse(l));
console.log(`[jsonl] 群聊记录 ${chatRows.length} 条`);

// 1d. 魔力转让 jsonl
const transferLines = readFileSync(join(legacyDir, '魔力转让记录-三国杯.jsonl'), 'utf8')
  .split(/\r?\n/).filter(Boolean);
console.log(`[jsonl] 魔力转让 ${transferLines.length} 条`);

// ---------- 2. 回合重建（先清测试遗留） ----------
const cleanup = db.transaction(() => {
  db.prepare('DELETE FROM action_submission WHERE campaign_id = ?').run(CAMPAIGN_ID);
  db.prepare('DELETE FROM action_history WHERE campaign_id = ?').run(CAMPAIGN_ID);
  db.prepare('DELETE FROM campaign_round WHERE campaign_id = ?').run(CAMPAIGN_ID);

  const insRound = db.prepare(
    `INSERT INTO campaign_round (campaign_id, turn_number, status, created_at, closed_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  // turn 序列：1=跳伞(降临日) 2=第1天昼 3=第1天夜 4=第2天昼 5=第2天夜(当前收集中)
  insRound.run(CAMPAIGN_ID, 1, 'closed', '2026-08-29 20:00:00', '2026-08-31 23:00:00');
  insRound.run(CAMPAIGN_ID, 2, 'closed', '2026-09-04 12:00:00', '2026-09-04 20:20:00');
  insRound.run(CAMPAIGN_ID, 3, 'closed', '2026-09-05 12:00:00', '2026-09-06 21:00:00');
  insRound.run(CAMPAIGN_ID, 4, 'closed', '2026-09-08 12:00:00', '2026-09-15 23:00:00');
  insRound.run(CAMPAIGN_ID, 5, 'OPEN', '2026-09-16 12:00:00', null);
});
cleanup();
const roundId = (n) => db.prepare('SELECT id FROM campaign_round WHERE campaign_id = ? AND turn_number = ?').get(CAMPAIGN_ID, n)?.id;
console.log(`[round] 回合重建完成：turn1-4 closed，turn5 OPEN（id=${roundId(5)}）`);

// ---------- 3. 行动历史快照 ----------
const insHistory = db.prepare(`
  INSERT INTO action_history (campaign_id, round_number, closed_at, action_order, servant_actions, master_actions)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const historyTx = db.transaction(() => {
  // turn1：跳伞落点（每单位的降临行动）
  const t1Servant = jumpRows.map(r => ({ servantClass: r.cls, content: `降临-${r.drop}（从者 ${r.servant} / ${r.servantCode}）`, submittedBy: '' }));
  const t1Master = jumpRows.map(r => ({ servantClass: r.cls, content: `降临-${r.drop}（御主 ${r.master} / ${r.masterCode}）`, submittedBy: '' }));
  insHistory.run(CAMPAIGN_ID, 1, '2026-08-31 23:00:00', null, JSON.stringify(t1Servant), JSON.stringify(t1Master));

  // turn2 / turn3：第1天昼 / 夜的行动提交（结算记录 md 表格）
  const toRows = (list) => ({
    servant: list.map(r => ({ servantClass: r.servantClass, content: r.servant, submittedBy: '' })),
    master: list.map(r => ({ servantClass: r.servantClass, content: r.master, submittedBy: '' })),
  });
  const d2 = toRows(dayActions);
  insHistory.run(CAMPAIGN_ID, 2, '2026-09-04 20:20:00', null, JSON.stringify(d2.servant), JSON.stringify(d2.master));
  const d3 = toRows(nightActions);
  insHistory.run(CAMPAIGN_ID, 3, '2026-09-06 21:00:00', null, JSON.stringify(d3.servant), JSON.stringify(d3.master));
});
historyTx();
const histCount = db.prepare('SELECT COUNT(*) AS c FROM action_history WHERE campaign_id = ?').get(CAMPAIGN_ID).c;
console.log(`[history] 行动快照写入 ${histCount} 条（turn1/2/3）`);

// ---------- 4. 群聊记录 → message_log ----------
// message_log 字段：campaign_id, channel, group_id, group_name, user_name, content, created_at
const insMsg = db.prepare(`
  INSERT INTO message_log (campaign_id, channel, group_id, group_name, user_name, content, created_at)
  VALUES (?, 'group', ?, ?, ?, ?, ?)
`);
const msgTx = db.transaction(() => {
  for (const r of chatRows) {
    insMsg.run(
      CAMPAIGN_ID,
      String(r.guildId || ''),
      r.groupName || null,
      r.nickname || null,
      r.text || '',
      toLocal(r.ts),
    );
  }
});
msgTx();
const msgCount = db.prepare('SELECT COUNT(*) AS c FROM message_log WHERE campaign_id = ?').get(CAMPAIGN_ID).c;
console.log(`[message_log] 群聊导入完成，库内共 ${msgCount} 条`);

// ---------- 5. 魔力转让台账追加 ----------
const transferFile = join(root, 'data', 'magic-transfers.jsonl');
let appended = 0;
for (const line of transferLines) {
  const rec = JSON.parse(line);
  // 旧格式 {ts, group, guildId, class, user, from, to, amount, content} → 新台账格式
  appendFileSync(transferFile, JSON.stringify({
    ts: rec.ts,
    guildId: rec.guildId,
    user: rec.user,
    from: rec.from,
    to: rec.to,
    amount: rec.amount,
    content: rec.content,
  }) + '\n', 'utf8');
  appended++;
}
console.log(`[transfer] 魔力转让台账追加 ${appended} 条`);

// ---------- 6. 汇总验证 ----------
const rounds = db.prepare('SELECT turn_number, status FROM campaign_round WHERE campaign_id = ? ORDER BY turn_number').all(CAMPAIGN_ID);
console.log('[verify] 回合：', rounds.map(r => `turn${r.turn_number}=${r.status}`).join(', '));
console.log('导入完成');
db.close();
