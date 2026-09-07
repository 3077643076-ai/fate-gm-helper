// 引擎状态表初始化（M1：行动登记/位置/生效效果/需裁决/群映射）
// 设计原则：settler 是纯函数，这些表是它的输入输出；副作用（发 QQ）不在这里
import { DatabaseSync } from 'node:sqlite'

/**
 * 确保引擎相关表存在（幂等）
 * @param {DatabaseSync} db
 */
export function ensureEngineTables(db) {
  db.exec(`
    -- 本时段行动登记（每个角色每时段主/从各一条；UNIQUE 防重复提交）
    CREATE TABLE IF NOT EXISTS engine_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      round INTEGER NOT NULL,
      phase TEXT NOT NULL,             -- 昼/夜
      unit_key TEXT NOT NULL,          -- 单位键：弓从/弓御/枪从...（与别名表 kind 对应）
      action_key TEXT NOT NULL,        -- 归一后动词（action_rules.action_key）
      target TEXT,                     -- 目标（灵脉名/单位，可空）
      variant TEXT,                    -- 变体（如 魂食:遮断/恶性/无限制）
      raw_text TEXT,                   -- 玩家原文
      status TEXT DEFAULT 'declared',  -- declared/settled/replaced(被介入替换)/void
      settle_note TEXT,                -- 结算结果摘要
      created_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(campaign_id, round, phase, unit_key)
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
