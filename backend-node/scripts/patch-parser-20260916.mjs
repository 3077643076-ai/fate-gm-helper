// 一次性补丁：白名单别名补全 + 清理存量解析噪音裁决（跑完归档）
// 依据：三国杯第二日昼真实公告的解析失败样本（需裁决 #11-69）
import Database from 'better-sqlite3';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(dirname(fileURLToPath(import.meta.url))), 'data');
const db = new Database(join(root, 'gm_helper.db'));
db.pragma('journal_mode = WAL');

// ---------- 1. alias_registry 补 action 别名（幂等） ----------
const aliases = [
  // [alias, canonical(action 首词为白名单动词), note]
  ['待机', '休整', '待机=不行动，按休整口径'],
  ['制作', '礼装制作', '玩家"制作 X"通指礼装/道具制作'],
  ['长坂坡征兵', '征兵', '狂御·曹植 长坂坡征兵=征兵变体'],
  ['契约之书', '礼装制作', '杀御"契约之书"=礼装制作契约之书'],
  ['空花结阵', '解放 虚荣的空中庭院', '术御·曹植 空花结阵=解放空中花园'],
  ['魔镜卢恩魔术·发动效果2', '广泛侦查', '杀从·贾诩 魔镜卢恩效果2=广侦类信息行动（第1天昼判例）'],
];
const insAlias = db.prepare(`
  INSERT OR IGNORE INTO alias_registry (alias, canonical, kind) VALUES (?, ?, 'action')
`);
for (const [alias, canonical] of aliases) {
  insAlias.run(alias, canonical);
  console.log(`alias: ${alias} -> ${canonical}`);
}

// ---------- 2. 清理存量解析噪音裁决（59 条重复 parse_fail） ----------
const clear = db.prepare(`
  UPDATE engine_pending_ruling SET status='resolved',
    resolution='忽略（解析噪音——解析器已升级，重新代收后不会再现）',
    resolved_at=datetime('now','localtime')
  WHERE campaign_id = 999002 AND status = 'open' AND kind = 'parse_fail'
`).run();
console.log(`[cleanup] 已忽略存量 parse_fail 裁决 ${clear.changes} 条`);

// ---------- 3. 验证 ----------
const openLeft = db.prepare(`SELECT COUNT(*) c FROM engine_pending_ruling WHERE campaign_id=999002 AND status='open'`).get().c;
console.log(`[verify] open 裁决剩余：${openLeft}`);
db.close();
console.log('patch done');
