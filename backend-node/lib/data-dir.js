// 数据目录唯一入口：默认 <backend-node>/data
// 为什么需要它：分发版（Electron 便携 exe）会把程序解包到临时目录运行，
//   于是 __dirname 指向临时目录——数据库、NapCat（28MB 下载 + QQ 登录态）、魔力台账
//   都会跟着临时目录一起丢。main.cjs 因此用 FATE_DATA_DIR 把数据目录指到 exe 旁边的 data/。
// 优先级：FATE_DATA_DIR（分发版） > backend-node/data（本机开发）
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.FATE_DATA_DIR
  ? path.resolve(process.env.FATE_DATA_DIR)
  : path.join(__dirname, '..', 'data');

try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (e) {
  console.error(`[data-dir] 创建数据目录失败（${DATA_DIR}）：${e.message}`);
}

// 拼数据目录下的文件路径：dataFile('napcat')、dataFile('magic-transfers.jsonl') ...
function dataFile(...parts) {
  return path.join(DATA_DIR, ...parts);
}

module.exports = { DATA_DIR, dataFile };
