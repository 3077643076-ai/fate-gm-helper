// 引擎状态表初始化（M1：行动登记/位置/生效效果/需裁决/群映射）
// 设计原则：settler 是纯函数，这些表是它的输入输出；副作用（发 QQ）不在这里
import { DatabaseSync } from 'node:sqlite'

/**
 * 确保引擎相关表存在（幂等）
 * @param {DatabaseSync} db
 */
export function ensureEngineTables(db) {
  // ===== 业务表（与 backend-node/db.js 的 initSchema 保持一致；分发版空库首次启动也要齐全） =====
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
  `)

  // ===== 引擎表 =====
  db.exec(`
    -- 本时段行动登记（支持多动：异能者等多次行动技能，每动一条 slot 递增）
    CREATE TABLE IF NOT EXISTS engine_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      round INTEGER NOT NULL,
      phase TEXT NOT NULL,             -- 昼/夜
      unit_key TEXT NOT NULL,          -- 单位键：弓从/弓御/枪从...（与别名表 kind 对应）
      slot INTEGER NOT NULL DEFAULT 1, -- 本时段第几个行动（多动权时 1/2/3…）
      action_key TEXT NOT NULL,        -- 归一后动词（action_rules.action_key）
      target TEXT,                     -- 目标（灵脉/单位）
      variant TEXT,                    -- 变体（如 魂食:遮断/恶性/无限制）
      raw_text TEXT,                   -- 玩家原文
      status TEXT DEFAULT 'declared',  -- declared/settled/deferred/replaced(被介入替换)/void
      settle_note TEXT,                -- 结算结果摘要
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 角色实时位置（当前所在灵脉；机动的输出）
    CREATE TABLE IF NOT EXISTS engine_unit_location (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      unit_key TEXT NOT NULL,
      leyline TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(campaign_id, unit_key)
    );

    -- 场上生效效果（结界/宝具/buff；可见性判断与补正都查它）
    CREATE TABLE IF NOT EXISTS engine_active_effects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      effect_name TEXT NOT NULL,       -- 如 魔术结界：鲜血神殿 / 乐不思蜀
      scope TEXT NOT NULL,             -- leyline:灵脉名 / unit:单位键
      owner TEXT,                      -- 发起单位
      effect_text TEXT,
      started_round INTEGER,
      expires TEXT,                    -- 过期条件描述（离开灵脉失去/回合结束失去等）
      UNIQUE(campaign_id, effect_name, scope, owner)
    );

    -- 需裁决队列（解析失败/规则含糊/数值对不上）
    CREATE TABLE IF NOT EXISTS engine_pending_ruling (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER,
      round INTEGER,
      phase TEXT,
      kind TEXT NOT NULL,              -- parse_fail/rule_ambiguous/value_mismatch
      context TEXT NOT NULL,           -- 问题描述
      ai_guess TEXT,                   -- 引擎猜测（供 GM 参考）
      status TEXT DEFAULT 'open',      -- open/resolved
      resolution TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      resolved_at TEXT
    );

    -- 群映射（私组/灵脉群/公屏/GM 群；播报与群管理的目标）
    CREATE TABLE IF NOT EXISTS engine_group_binding (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      group_id TEXT NOT NULL,
      group_name TEXT,
      kind TEXT NOT NULL,              -- private/leyline/public/gm
      class TEXT,                      -- 私组职阶
      leyline TEXT,                    -- 灵脉群对应灵脉
      UNIQUE(campaign_id, group_id)
    );

    -- ===== 以下为工具/口径表（分发空库首次启动也要齐全，DDL 与各模块定义保持一致） =====

    -- 魔力账本（每笔变动一行）
    CREATE TABLE IF NOT EXISTS mana_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      source TEXT,
      round INTEGER,
      phase TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 判定单（投点登记制）
    CREATE TABLE IF NOT EXISTS judgment_ticket (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      action_name TEXT NOT NULL,
      target INTEGER,
      status TEXT NOT NULL DEFAULT 'open',
      roll INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT
    );

    -- 别名注册表（俗称→标准名，会自动生长）
    CREATE TABLE IF NOT EXISTS alias_registry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alias TEXT NOT NULL,
      canonical TEXT NOT NULL,
      kind TEXT NOT NULL,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(alias, canonical)
    );

    -- 魔力口径表
    CREATE TABLE IF NOT EXISTS mana_rules (
      rule_key TEXT PRIMARY KEY,
      rule_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_confirm',
      source TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- 行动规则表（引擎 parser/settler 数据源）
    CREATE TABLE IF NOT EXISTS action_rules (
      action_key   TEXT PRIMARY KEY,
      who          TEXT,
      base_rate    INTEGER,
      rate_formula TEXT,
      day_bonus    INTEGER DEFAULT 0,
      night_bonus  INTEGER DEFAULT 0,
      costs_action INTEGER DEFAULT 1,
      mana_cost    INTEGER DEFAULT 0,
      mana_gain    INTEGER DEFAULT 0,
      phase        TEXT NOT NULL,
      limit_per    TEXT,
      effect_text  TEXT,
      source       TEXT,
      status       TEXT DEFAULT 'confirmed'
    );

    -- 单位注册表（单位键→角色卡映射）
    CREATE TABLE IF NOT EXISTS unit_registry (
      unit_key TEXT PRIMARY KEY,
      class TEXT NOT NULL,
      side TEXT NOT NULL,
      code TEXT,
      card_id INTEGER,
      missing INTEGER DEFAULT 0
    );

    -- 战斗主记录（交互式状态机：formation→initial→main→final→done）
    CREATE TABLE IF NOT EXISTS engine_battles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      round INTEGER,
      phase TEXT,
      leyline TEXT,
      width INTEGER DEFAULT 3,
      attacker TEXT DEFAULT 'blue',
      blue_formation TEXT,
      yellow_formation TEXT,
      blue_stats TEXT,
      yellow_stats TEXT,
      missing_notes TEXT,
      blue_tactic TEXT,
      yellow_tactic TEXT,
      tactic_result TEXT,
      blue_main_attr TEXT,
      yellow_main_attr TEXT,
      random_attr TEXT,
      corrections TEXT DEFAULT '{}',
      floor_penalty TEXT DEFAULT '{}',
      death_fight TEXT DEFAULT '{}',
      win_rate TEXT,
      result TEXT,
      status TEXT DEFAULT 'formation',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT
    );
  `)
}

/**
 * 打开引擎数据库连接（复用主库文件）
 */
export function openEngineDb(dbPath) {
  const db = new DatabaseSync(dbPath)
  db.exec(`PRAGMA foreign_keys = ON`)
  ensureEngineTables(db)
  return db
}
