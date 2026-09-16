// 用途：把 fate-gm-helper 的项目运行数据备份到 U 盘（<盘符>:\圣杯GM数据备份\）
// 用法：node tools/backup-to-usb.mjs [U盘盘符，不传则自动识别带"圣杯GM数据备份"的盘]
// 说明：
//   1. 数据库用 VACUUM INTO 生成一致性快照（后端开着也能安全备份，不会拷到写到一半的库）
//   2. 其余目录（历史库备份/魔力台账/历史导入存档/玩家角色卡/AI会话记忆）直接拷贝
//   3. 可重复运行，数据库快照按时间戳命名，不会覆盖旧快照
//   4. 规则书 PDF 不备份（U 盘"空想RC规则1.15改"里已有）；NapCat 程序本体不备份（重装即可）
import { createRequire } from 'module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findUsbDrive, BACKUP_DIR_NAME } from './usb-drive.mjs'

// 加载 better-sqlite3（装在 backend-node 的 node_modules 里）
const require = createRequire(import.meta.url)
const Database = require('../backend-node/node_modules/better-sqlite3')

// 项目根目录（不管从哪运行，都以脚本所在位置推导，避免目录不对）
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// U 盘目标目录：盘符自动识别，避免硬编码 E: 写错盘（U 盘换台机器盘符就变）
const found = findUsbDrive(process.argv[2])
if (!found.letter) {
  console.log(`找不到 U 盘：${found.note}`)
  console.log('用法：node tools/backup-to-usb.mjs <盘符>    例：node tools/backup-to-usb.mjs H')
  process.exit(1)
}
const DRIVE = found.letter
const BACKUP_ROOT = `${DRIVE}:\\${BACKUP_DIR_NAME}`

// 源数据位置
const SRC_DB = path.join(ROOT, 'backend-node', 'data', 'gm_helper.db')
const SRC_BACKUPS = path.join(ROOT, 'backend-node', 'backups')
const SRC_TRANSFERS = path.join(ROOT, 'backend-node', 'data', 'magic-transfers.jsonl')
const SRC_LEGACY = path.join(ROOT, 'backend-node', 'data', 'legacy-import')
const SRC_CARDS = path.join(ROOT, '新三杯子')
const SRC_DSH = path.join(ROOT, '.dsh-meow')

// 目标子目录
const DEST_SNAPSHOTS = path.join(BACKUP_ROOT, '数据库快照')
const DEST_HISTORY = path.join(BACKUP_ROOT, '数据库历史备份')
const DEST_LEGACY = path.join(BACKUP_ROOT, '历史导入存档')
const DEST_CARDS = path.join(BACKUP_ROOT, '玩家角色卡')
const DEST_DSH = path.join(BACKUP_ROOT, 'AI会话记忆')

// 拷贝整个目录到目标（不存在就创建），返回拷贝的文件数
function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.log(`跳过（源不存在）: ${src}`)
    return 0
  }
  fs.mkdirSync(dest, { recursive: true })
  fs.cpSync(src, dest, { recursive: true })
  const count = fs.readdirSync(dest, { recursive: true }).filter((f) => fs.statSync(path.join(dest, f)).isFile()).length
  console.log(`拷贝完成: ${src} -> ${dest}（${count} 个文件）`)
  return count
}

function fmtSize(byte) {
  return byte > 1024 * 1024 ? `${(byte / 1024 / 1024).toFixed(1)} MB` : `${(byte / 1024).toFixed(1)} KB`
}

// ===== 开始备份 =====
console.log('===== fate-gm-helper 数据备份到 U 盘 =====')
console.log(`目标盘：${DRIVE}:（${found.note}）`)
if (!fs.existsSync(BACKUP_ROOT)) {
  console.log(`注意：${BACKUP_ROOT} 还不存在，这次会新建——确认 ${DRIVE}: 是 U 盘而不是本机硬盘`)
  fs.mkdirSync(BACKUP_ROOT, { recursive: true })
}

// 1. 数据库一致性快照（VACUUM INTO 生成独立文件，不影响正在运行的主库）
let snapSize = 0
if (fs.existsSync(SRC_DB)) {
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) // 例：20260916173022
  const snapPath = path.join(DEST_SNAPSHOTS, `gm_helper-${ts}.db`)
  const db = new Database(SRC_DB, { readonly: true })
  try {
    db.prepare('VACUUM INTO ?').run(snapPath)
    snapSize = fs.statSync(snapPath).size
    console.log(`数据库快照完成: ${snapPath}（${fmtSize(snapSize)}）`)
  } catch (err) {
    console.log(`数据库快照失败: ${err.message}`)
  } finally {
    db.close()
  }
} else {
  console.log(`跳过（数据库不存在）: ${SRC_DB}`)
}

// 2. 历史数据库备份（backups/*.db）
let histCount = 0
if (fs.existsSync(SRC_BACKUPS)) {
  fs.mkdirSync(DEST_HISTORY, { recursive: true })
  for (const f of fs.readdirSync(SRC_BACKUPS)) {
    if (f.endsWith('.db')) {
      fs.copyFileSync(path.join(SRC_BACKUPS, f), path.join(DEST_HISTORY, f))
      histCount++
    }
  }
  console.log(`历史库备份拷贝: ${histCount} 个`)
} else {
  console.log(`跳过（历史库目录不存在）: ${SRC_BACKUPS}`)
}

// 3. 魔力转让台账
if (fs.existsSync(SRC_TRANSFERS)) {
  fs.copyFileSync(SRC_TRANSFERS, path.join(BACKUP_ROOT, '魔力转让台账.jsonl'))
  console.log('魔力转让台账拷贝完成')
} else {
  console.log(`跳过（台账不存在）: ${SRC_TRANSFERS}`)
}

// 4. 历史导入存档
copyDir(SRC_LEGACY, DEST_LEGACY)

// 5. 玩家角色卡
copyDir(SRC_CARDS, DEST_CARDS)

// 6. AI 会话记忆
copyDir(SRC_DSH, DEST_DSH)

console.log('===== 备份完成 =====')
console.log(`目标位置: ${BACKUP_ROOT}`)
console.log('恢复方法：把对应目录拷回项目同名位置即可（见 U 盘内"说明_先读我.md"）')
