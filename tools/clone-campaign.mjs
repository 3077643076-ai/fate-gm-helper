// 战役克隆：把一个战役完整复制成测试副本（卡/状态/灵脉照搬，行动与群映射不带走）
//   用法：node tools/clone-campaign.mjs --from 999002 --to 999102 --name 三国杯测试副本 [--force]
//   --force：目标已存在时先清空目标数据再克隆（慎用）
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const requireCjs = createRequire(import.meta.url)
const Database = requireCjs(join(dirname(fileURLToPath(import.meta.url)), '..', 'backend-node', 'node_modules', 'better-sqlite3'))

const dbPath = process.env.FATE_GM_DB_PATH || 'backend-node/data/gm_helper.db'
const db = new Database(dbPath)

const args = process.argv.slice(2)
const arg = (k, d = null) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d }
const has = k => args.includes(`--${k}`)
const fromId = Number(arg('from'))
const toId = Number(arg('to'))
const toName = arg('name')
if (!fromId || !toId || !toName) {
  console.error('用法：node tools/clone-campaign.mjs --from <源战役ID> --to <新战役ID> --name <新战役名> [--force]')
  process.exit(1)
}

const src = db.prepare('SELECT * FROM campaign WHERE id = ?').get(fromId)
if (!src) { console.error(`源战役 ${fromId} 不存在`); process.exit(1) }
const exists = db.prepare('SELECT id FROM campaign WHERE id = ?').get(toId)
if (exists && !has('force')) { console.error(`目标战役 ${toId} 已存在（加 --force 覆盖）`); process.exit(1) }

db.transaction(() => {
  if (exists) {
    // 只清战役数据四件套，绝不动引擎行动/群映射/日志
    db.prepare('DELETE FROM character_status WHERE campaign_id = ?').run(toId)
    db.prepare('DELETE FROM leyline_assignment WHERE campaign_id = ?').run(toId)
    db.prepare('DELETE FROM leyline WHERE campaign_id = ?').run(toId)
    db.prepare('DELETE FROM character_card WHERE campaign_id = ?').run(toId)
    db.prepare('DELETE FROM campaign WHERE id = ?').run(toId)
  }

  db.prepare('INSERT INTO campaign (id, name, description, created_at) VALUES (?, ?, ?, datetime(?))')
    .run(toId, toName, `克隆自 ${fromId}（${src.name}）@ ${new Date().toISOString().slice(0, 10)}；测试用副本`, src.created_at)

  // 角色卡：整卡复制，id 重新分配，记录映射
  const cards = db.prepare('SELECT * FROM character_card WHERE campaign_id = ?').all(fromId)
  const cardMap = new Map()
  const insCard = db.prepare(`INSERT INTO character_card
    (code, class_name, raw_text, card_type, campaign_id, total_level, total_strength, total_endurance, total_agility,
     total_mana, total_luck, total_noble_phantasm, base_level, base_strength, base_endurance, base_agility, base_mana,
     base_luck, base_noble_phantasm)
    SELECT code, class_name, raw_text, card_type, ?, total_level, total_strength, total_endurance, total_agility,
     total_mana, total_luck, total_noble_phantasm, base_level, base_strength, base_endurance, base_agility, base_mana,
     base_luck, base_noble_phantasm FROM character_card WHERE id = ?`)
  for (const c of cards) {
    const info = insCard.run(toId, c.id)
    cardMap.set(c.id, Number(info.lastInsertRowid))
  }

  // 角色状态：按回合照搬（魔力台账历史保留，方便测魔力对照）
  const st = db.prepare(`INSERT INTO character_status
    (character_card_id, campaign_id, round_number, current_mana, mana_limit, current_command_seals, status_effects, status_effects_list, notes)
    SELECT ?, ?, round_number, current_mana, mana_limit, current_command_seals, status_effects, status_effects_list, notes
      FROM character_status WHERE id = ?`)
  const statuses = db.prepare('SELECT id FROM character_status WHERE campaign_id = ?').all(fromId)
  for (const s of statuses) {
    const row = db.prepare('SELECT character_card_id FROM character_status WHERE id = ?').get(s.id)
    st.run(cardMap.get(row.character_card_id), toId, s.id)
  }

  // 灵脉：全字段复制；assigned_character_ids 里的卡 id 按映射重写
  const leylines = db.prepare('SELECT * FROM leyline WHERE campaign_id = ?').all(fromId)
  const insLey = db.prepare(`INSERT INTO leyline
    (campaign_id, name, mana_amount, battlefield_width, population_flow, effect, description, assigned_character_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  const leyMap = new Map()
  for (const l of leylines) {
    let assigned = l.assigned_character_ids
    if (assigned) {
      try {
        const arr = JSON.parse(assigned)
        if (Array.isArray(arr)) assigned = JSON.stringify(arr.map(id => cardMap.get(id) ?? id))
      } catch { /* 非 JSON 格式保持原样 */ }
    }
    const info = insLey.run(toId, l.name, l.mana_amount, l.battlefield_width, l.population_flow, l.effect, l.description, assigned)
    leyMap.set(l.id, Number(info.lastInsertRowid))
  }

  // 灵脉分配：卡与灵脉都重映射
  const la = db.prepare('SELECT * FROM leyline_assignment WHERE campaign_id = ?').all(fromId)
  const insLA = db.prepare('INSERT INTO leyline_assignment (campaign_id, leyline_id, character_card_id) VALUES (?, ?, ?)')
  for (const a of la) {
    if (leyMap.has(a.leyline_id) && cardMap.has(a.character_card_id)) insLA.run(toId, leyMap.get(a.leyline_id), cardMap.get(a.character_card_id))
  }

  console.log(`克隆完成 ${fromId} → ${toId}「${toName}」`)
  console.log(`  角色卡 ${cards.length} 张、角色状态 ${statuses.length} 条、灵脉 ${leylines.length} 条、灵脉分配 ${la.length} 条`)
  console.log('  引擎行动/群映射/日志未复制（测试副本从零开始）')
})()
