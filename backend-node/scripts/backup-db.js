const fs = require('fs');
const path = require('path');

const defaultDbPath = path.join(__dirname, '..', 'data', 'gm_helper.db');
const dbPath = process.env.FATE_GM_DB_PATH || defaultDbPath;
const backupDir = process.env.FATE_GM_BACKUP_DIR || path.join(__dirname, '..', 'backups');

function getTimestamp() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('-') + '-' + [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
}

function main() {
  if (!fs.existsSync(dbPath)) {
    console.error(`未找到 SQLite 数据库：${dbPath}`);
    console.error('请先启动一次后端，或检查 FATE_GM_DB_PATH 是否指向正确位置。');
    process.exit(1);
  }

  // 备份目录默认放在 backend-node/backups，方便本地直接复制走。
  fs.mkdirSync(backupDir, { recursive: true });

  const ext = path.extname(dbPath) || '.db';
  const backupPath = path.join(backupDir, `gm_helper-${getTimestamp()}${ext}`);
  fs.copyFileSync(dbPath, backupPath);

  console.log(`数据库备份完成：${backupPath}`);
}

main();
