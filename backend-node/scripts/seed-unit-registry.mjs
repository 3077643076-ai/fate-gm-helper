// unit_registry：单位键 → 角色卡映射（引擎查卡用，替代模糊匹配）
// 数据：三国杯 7 组主从；card_id 按 code 现查 character_card（跨机器 id 不同也不怕），
//       查不到卡 → missing=1（引擎遇此单位查卡时提示补卡）
// 用法：node backend-node/scripts/seed-unit-registry.mjs
import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const db = new DatabaseSync(join(root, 'backend-node', 'data', 'gm_helper.db'))
const CAMPAIGN = 999002 // 三国杯（卡按 战役+code 定位）

db.exec(`
  CREATE TABLE IF NOT EXISTS unit_registry (
    unit_key TEXT PRIMARY KEY,   -- 弓从/弓御/枪从...
    class TEXT NOT NULL,         -- 弓/枪/剑/骑/杀/术/狂
    side TEXT NOT NULL,          -- SERVANT/MASTER
    code TEXT,                   -- 角色名（司马师/火焰驹...）
    card_id INTEGER,             -- character_card.id；NULL=卡缺失
    missing INTEGER DEFAULT 0    -- 1=卡缺失（引擎遇此单位查卡时提示补卡）
  );
`)

const UNITS = [
  ['弓从', '弓', 'SERVANT', '司马师'],
  ['弓御', '弓', 'MASTER', '火焰驹'],
  ['杀从', '杀', 'SERVANT', '贾诩'],
  ['杀御', '杀', 'MASTER', '左慈'],
  ['骑从', '骑', 'SERVANT', '文鸯'],
  ['骑御', '骑', 'MASTER', '关羽'],
  ['枪从', '枪', 'SERVANT', '吕布'],
  ['枪御', '枪', 'MASTER', '曹丕'],
  ['剑从', '剑', 'SERVANT', '刘协'],
  ['剑御', '剑', 'MASTER', '荀彧'],
  ['术从', '术', 'SERVANT', '张角'],
  ['术御', '术', 'MASTER', '曹植'],
  ['狂从', '狂', 'SERVANT', '魏延'],
  ['狂御', '狂', 'MASTER', '阿斗'],
]

// card_id 按 code 现查（本战役）；查不到 → null + missing=1
const findCard = db.prepare(`SELECT id FROM character_card WHERE code = ? AND campaign_id = ?`)
const up = db.prepare(`
  INSERT OR REPLACE INTO unit_registry (unit_key, class, side, code, card_id, missing)
  VALUES (?, ?, ?, ?, ?, ?)
`)
let missing = 0
for (const [key, cls, side, code] of UNITS) {
  const card = findCard.get(code, CAMPAIGN)
  if (!card) missing++
  up.run(key, cls, side, code, card?.id ?? null, card ? 0 : 1)
}
console.log(`unit_registry 录入 ${UNITS.length} 条（缺卡 ${missing} 张）`)
console.log(db.prepare(`SELECT unit_key, code, card_id, missing FROM unit_registry ORDER BY unit_key`).all()
  .map(r => `${r.unit_key}=${r.code}${r.missing ? '(缺卡)' : '#' + r.card_id}`).join(' | '))
