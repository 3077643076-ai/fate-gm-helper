// lib/store.mjs —— SQLite 访问与表初始化
// 用 Node 24 内置的 node:sqlite（零 npm 依赖，插件目录不需要 node_modules）
import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))            // .../tools/fate-gm-tools/lib
const projectRoot = dirname(dirname(dirname(here)))             // lib → fate-gm-tools → tools → 项目根

/** 解析配置里的路径（不配置时按项目默认位置推导） */
function resolveConfig(config = {}) {
  return {
    dbPath: config.dbPath ?? join(projectRoot, 'backend-node', 'data', 'gm_helper.db'),
    knowledgeDir: config.knowledgeDir ?? join(projectRoot, 'knowledge'),
  }
}

// 数据库连接按路径缓存（同一文件只开一次；同步 API，带团场景单线程足够）
const dbCache = new Map()

/** 打开（或复用）数据库连接，并确保本插件需要的表存在 */
export function openDb(config = {}) {
  const { dbPath } = resolveConfig(config)
  if (!existsSync(dbPath)) {
    throw new Error(`数据库文件不存在：${dbPath}（先用 backend-node 跑一次后端自动建库，或在插件 config 里指定 dbPath）`)
  }
  if (!dbCache.has(dbPath)) {
    const db = new DatabaseSync(dbPath)
    // 魔力账本表：每笔变动一行，是"数字不经过 AI 脑子"的载体
    db.exec(`
      CREATE TABLE IF NOT EXISTS mana_ledger (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        role       TEXT NOT NULL,              -- 角色（职阶或代号，原样存）
        delta      INTEGER NOT NULL,           -- 变动量（加正减负）
        reason     TEXT NOT NULL,              -- 事由
        source     TEXT,                       -- 来源（公告/判定/技能/转移）
        round      INTEGER,                    -- 回合号（第几天）
        phase      TEXT,                       -- 时段（昼/夜）
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      )
    `)
    dbCache.set(dbPath, db)
  }
  return dbCache.get(dbPath)
}

export { resolveConfig }
