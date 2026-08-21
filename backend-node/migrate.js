/**
 * 可选：旧 MySQL → SQLite 数据迁移脚本
 *
 * 正常运行后端不需要 MySQL，只使用 better-sqlite3。
 * 如果确实要从旧 MySQL 导一次数据，先在 backend-node 临时安装 mysql2：
 *   npm install mysql2 --no-save
 *
 * 环境变量：
 *   MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE
 *   FATE_GM_DB_PATH  指定 SQLite 文件路径，默认 data/gm_helper.db
 */

let mysql;
try {
  mysql = require('mysql2/promise');
} catch {
  console.error('缺少可选依赖 mysql2。若要执行旧 MySQL 数据迁移，请先运行：npm install mysql2 --no-save');
  process.exit(1);
}

const { getDb } = require('./db');

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'GmHelper',
  charset: 'utf8mb4',
};

// 表迁移顺序（先主表后从表，满足外键依赖）
const TABLES = [
  {
    name: 'campaign',
    columns: ['id', 'name', 'description', 'created_at'],
  },
  {
    name: 'character_card',
    columns: [
      'id', 'code', 'class_name', 'raw_text', 'card_type', 'campaign_id',
      'total_level', 'total_strength', 'total_endurance', 'total_agility', 'total_mana', 'total_luck', 'total_noble_phantasm',
      'base_level', 'base_strength', 'base_endurance', 'base_agility', 'base_mana', 'base_luck', 'base_noble_phantasm',
      'corr_level', 'corr_strength', 'corr_endurance', 'corr_agility', 'corr_mana', 'corr_luck', 'corr_noble_phantasm',
      'class_skills', 'personal_skills', 'noble_phantasms', 'workshops', 'craft_essences',
      'retired', 'created_at',
    ],
  },
  {
    name: 'campaign_round',
    columns: ['id', 'campaign_id', 'turn_number', 'status', 'created_at', 'closed_at'],
  },
  {
    name: 'leyline',
    columns: ['id', 'campaign_id', 'name', 'mana_amount', 'battlefield_width', 'population_flow', 'effect', 'description', 'assigned_character_ids'],
  },
  {
    name: 'leyline_assignment',
    columns: ['id', 'campaign_id', 'leyline_id', 'character_card_id'],
  },
  {
    name: 'battle_sheet',
    columns: [
      'id', 'campaign_id', 'round_id',
      'blue_positions', 'yellow_positions', 'activated_skills',
      'blue_tactic', 'yellow_tactic', 'battlefield_width',
      'blue_pre_battle_bonus', 'blue_pre_battle_penalty',
      'yellow_pre_battle_bonus', 'yellow_pre_battle_penalty',
      'mana_data', 'group_a_stats', 'group_b_stats', 'win_rate_result',
      'settlement_confirmed', 'confirmed_at',
      'created_at', 'updated_at',
    ],
  },
  {
    name: 'character_status',
    columns: [
      'id', 'character_card_id', 'campaign_id', 'round_number',
      'current_mana', 'mana_limit', 'current_command_seals',
      'status_effects', 'status_effects_list', 'notes',
      'created_at', 'updated_at',
    ],
  },
  {
    name: 'action_history',
    columns: ['id', 'campaign_id', 'round_number', 'closed_at', 'action_order', 'servant_actions', 'master_actions', 'created_at'],
  },
  {
    name: 'action_submission',
    columns: ['id', 'round_id', 'round_number', 'campaign_id', 'servant_class', 'action_type', 'content', 'submitted_by', 'is_current', 'created_at'],
  },
  {
    name: 'skill_template',
    columns: [
      'id', 'name', 'rank', 'skill_type', 'timing', 'position_limit',
      'mana_cost', 'cooldown', 'stat_modifiers',
      'win_rate_modifier', 'enemy_win_rate_modifier',
      'status_effects', 'raw_text', 'notes',
      'created_at', 'updated_at',
    ],
  },
  {
    name: 'app_settings',
    columns: ['id', 'setting_key', 'setting_value', 'created_at', 'updated_at'],
  },
];

async function main() {
  console.log('=== 可选迁移：MySQL → SQLite ===\n');

  let mysqlConn;
  try {
    mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
    console.log(`[OK] 已连接 MySQL (${MYSQL_CONFIG.database})`);
  } catch (e) {
    console.error('[失败] 无法连接 MySQL:', e.message);
    process.exit(1);
  }

  const db = getDb();
  db.pragma('foreign_keys = OFF');

  let totalRows = 0;
  const tx = db.transaction((table, rows) => {
    const cols = table.columns;
    const placeholders = cols.map(() => '?').join(', ');
    const quotedCols = cols.map(c => `"${c}"`).join(', ');
    const insert = db.prepare(`INSERT OR REPLACE INTO "${table.name}" (${quotedCols}) VALUES (${placeholders})`);

    for (const row of rows) {
      const values = cols.map(c => normalizeMysqlValue(row[c]));
      insert.run(...values);
    }
  });

  for (const table of TABLES) {
    try {
      const [rows] = await mysqlConn.execute(`SELECT * FROM \`${table.name}\``);
      if (rows.length === 0) {
        console.log(`[跳过] ${table.name} — 0 行`);
        continue;
      }

      tx(table, rows);
      console.log(`[OK] ${table.name} — ${rows.length} 行`);
      totalRows += rows.length;
    } catch (e) {
      console.error(`[失败] ${table.name}:`, e.message);
    }
  }

  db.pragma('foreign_keys = ON');
  await mysqlConn.end();

  console.log(`\n=== 迁移完成，共 ${totalRows} 行 ===`);
  console.log(`SQLite 文件: ${process.env.FATE_GM_DB_PATH || 'backend-node/data/gm_helper.db'}`);
}

function normalizeMysqlValue(value) {
  if (value === undefined) return null;
  if (Buffer.isBuffer(value)) return value[0] !== 0 ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

main().catch(e => {
  console.error('迁移失败:', e);
  process.exit(1);
});
