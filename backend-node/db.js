const path = require('path');
const fs = require('fs');

// ---------- 数据库驱动双模式 ----------
// 首选 better-sqlite3（本机 node 环境，ABI 匹配）；
// 加载失败（如 Electron 运行时 ABI 不同）时自动回退 Node 内置 node:sqlite 的兼容适配层，
// 使同一份代码在"本机开发"与"分发 exe"两种环境都能跑。
let Database;
let driverName = 'better-sqlite3';
try {
  const BetterSqlite3 = require('better-sqlite3');
  // ABI 探测必须实例化：.node 二进制的版本检查发生在 dlopen（new）时而非 require 时
  BetterSqlite3(':memory:').close();
  Database = BetterSqlite3;
} catch (e) {
  driverName = 'node:sqlite-compat';
  const { DatabaseSync } = require('node:sqlite');

  // 预处理语句包装：清洗参数类型（undefined→null、boolean→1/0），对齐 better-sqlite3 行为
  class StatementCompat {
    constructor(stmt) { this._stmt = stmt; }
    _clean(params) {
      return params.map(p => (p === undefined ? null : (typeof p === 'boolean' ? (p ? 1 : 0) : p)));
    }
    run(...params) { return this._stmt.run(...this._clean(params)); }
    all(...params) { return this._stmt.all(...this._clean(params)); }
    get(...params) { return this._stmt.get(...this._clean(params)); }
  }

  // 连接包装：提供 prepare/exec/pragma/transaction 四个 better-sqlite3 常用接口
  class DatabaseCompat {
    constructor(file) { this._db = new DatabaseSync(file); }
    prepare(sql) { return new StatementCompat(this._db.prepare(sql)); }
    exec(sql) { return this._db.exec(sql); }
    pragma(source) { return this._db.exec(`PRAGMA ${source}`); }
    transaction(fn) {
      const raw = this._db;
      return function (...args) {
        raw.exec('BEGIN');
        try {
          const result = fn(...args);
          raw.exec('COMMIT');
          return result;
        } catch (err) {
          raw.exec('ROLLBACK');
          throw err;
        }
      };
    }
  }
  Database = DatabaseCompat;
}

const DB_PATH = process.env.FATE_GM_DB_PATH || path.join(__dirname, 'data', 'gm_helper.db');

let db;

function getDb() {
  if (!db) {
    // 确保 data 目录存在
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    console.log(`[db] 驱动: ${driverName}，库: ${DB_PATH}`);
  }
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaign (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS character_card (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT,
      class_name TEXT,
      raw_text TEXT,
      card_type TEXT NOT NULL DEFAULT 'SERVANT',
      campaign_id INTEGER REFERENCES campaign(id),
      total_level INTEGER DEFAULT 0,
      total_strength INTEGER DEFAULT 0,
      total_endurance INTEGER DEFAULT 0,
      total_agility INTEGER DEFAULT 0,
      total_mana INTEGER DEFAULT 0,
      total_luck INTEGER DEFAULT 0,
      total_noble_phantasm INTEGER DEFAULT 0,
      base_level INTEGER DEFAULT 0,
      base_strength INTEGER DEFAULT 0,
      base_endurance INTEGER DEFAULT 0,
      base_agility INTEGER DEFAULT 0,
      base_mana INTEGER DEFAULT 0,
      base_luck INTEGER DEFAULT 0,
      base_noble_phantasm INTEGER DEFAULT 0,
      corr_level INTEGER DEFAULT 0,
      corr_strength INTEGER DEFAULT 0,
      corr_endurance INTEGER DEFAULT 0,
      corr_agility INTEGER DEFAULT 0,
      corr_mana INTEGER DEFAULT 0,
      corr_luck INTEGER DEFAULT 0,
      corr_noble_phantasm INTEGER DEFAULT 0,
      class_skills TEXT,
      personal_skills TEXT,
      noble_phantasms TEXT,
      workshops TEXT,
      craft_essences TEXT,
      retired INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaign_round (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaign(id),
      turn_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      created_at TEXT DEFAULT (datetime('now')),
      closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS battle_sheet (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaign(id),
      round_id INTEGER NOT NULL REFERENCES campaign_round(id),
      blue_positions TEXT,
      yellow_positions TEXT,
      activated_skills TEXT,
      blue_tactic TEXT,
      yellow_tactic TEXT,
      battlefield_width INTEGER DEFAULT 0,
      blue_pre_battle_bonus INTEGER DEFAULT 0,
      blue_pre_battle_penalty INTEGER DEFAULT 0,
      yellow_pre_battle_bonus INTEGER DEFAULT 0,
      yellow_pre_battle_penalty INTEGER DEFAULT 0,
      mana_data TEXT,
      group_a_stats TEXT,
      group_b_stats TEXT,
      win_rate_result TEXT,
      settlement_confirmed INTEGER DEFAULT 0,
      confirmed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS leyline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaign(id),
      name TEXT NOT NULL,
      mana_amount INTEGER NOT NULL DEFAULT 0,
      battlefield_width INTEGER NOT NULL DEFAULT 0,
      population_flow INTEGER NOT NULL DEFAULT 0,
      effect TEXT,
      description TEXT,
      assigned_character_ids TEXT
    );

    CREATE TABLE IF NOT EXISTS leyline_assignment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaign(id),
      leyline_id INTEGER NOT NULL REFERENCES leyline(id),
      character_card_id INTEGER NOT NULL REFERENCES character_card(id)
    );

    CREATE TABLE IF NOT EXISTS character_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_card_id INTEGER NOT NULL REFERENCES character_card(id),
      campaign_id INTEGER NOT NULL REFERENCES campaign(id),
      round_number INTEGER NOT NULL,
      current_mana INTEGER,
      mana_limit INTEGER,
      current_command_seals INTEGER,
      status_effects TEXT,
      status_effects_list TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(character_card_id, campaign_id, round_number)
    );

    CREATE TABLE IF NOT EXISTS action_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaign(id),
      round_number INTEGER NOT NULL,
      closed_at TEXT,
      action_order TEXT,
      servant_actions TEXT,
      master_actions TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS action_submission (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL REFERENCES campaign_round(id),
      round_number INTEGER NOT NULL,
      campaign_id INTEGER NOT NULL REFERENCES campaign(id),
      servant_class TEXT NOT NULL,
      action_type TEXT NOT NULL,
      content TEXT NOT NULL,
      submitted_by TEXT,
      is_current INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- GM 手动行动记录（行动表 Excel 的网页版兜底工作流）
    -- day: 0=跳伞(降临日), 1..14=第N天; period: JUMP/DAY/NIGHT
    CREATE TABLE IF NOT EXISTS action_record (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaign(id),
      day INTEGER NOT NULL,
      period TEXT NOT NULL,
      servant_class TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(campaign_id, day, period, servant_class, role)
    );

    CREATE TABLE IF NOT EXISTS skill_template (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      rank TEXT,
      skill_type TEXT,
      timing TEXT,
      position_limit TEXT,
      mana_cost INTEGER DEFAULT 0,
      cooldown INTEGER DEFAULT 0,
      stat_modifiers TEXT,
      win_rate_modifier INTEGER DEFAULT 0,
      enemy_win_rate_modifier INTEGER DEFAULT 0,
      status_effects TEXT,
      raw_text TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT UNIQUE NOT NULL,
      setting_value TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS qq_group_binding (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      campaign_id INTEGER NOT NULL REFERENCES campaign(id),
      group_name TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(platform, guild_id)
    );

    CREATE TABLE IF NOT EXISTS battle_review_snapshot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      battle_sheet_id INTEGER NOT NULL REFERENCES battle_sheet(id),
      campaign_id INTEGER NOT NULL REFERENCES campaign(id),
      round_id INTEGER NOT NULL REFERENCES campaign_round(id),
      turn_number INTEGER,
      title TEXT,
      summary_text TEXT,
      snapshot_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(battle_sheet_id)
    );

    CREATE TABLE IF NOT EXISTS kb_chunk (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_file TEXT NOT NULL,
      title TEXT NOT NULL,
      heading TEXT,
      heading_level INTEGER DEFAULT 0,
      content TEXT NOT NULL,
      char_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS kb_chunk_fts USING fts5(
      source_file, title, content
    );
  `);

  ensureColumns(db, 'battle_sheet', {
    battlefield_width: 'INTEGER DEFAULT 0',
    yellow_pre_battle_bonus: 'INTEGER DEFAULT 0',
    yellow_pre_battle_penalty: 'INTEGER DEFAULT 0',
    mana_data: 'TEXT',
    group_a_stats: 'TEXT',
    group_b_stats: 'TEXT',
    win_rate_result: 'TEXT',
    settlement_confirmed: 'INTEGER DEFAULT 0',
    confirmed_at: 'TEXT',
  });

  ensureColumns(db, 'skill_template', {
    effects_json: 'TEXT',
    conditions_json: 'TEXT',
    manual_judgment: 'INTEGER DEFAULT 0',
    source_book: 'TEXT',
    source_section: 'TEXT',
  });
}

function ensureColumns(db, tableName, columns) {
  const existing = new Set(db.prepare(`PRAGMA table_info(${tableName})`).all().map(col => col.name));
  for (const [name, definition] of Object.entries(columns)) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${name} ${definition}`);
    }
  }
}

module.exports = { getDb };