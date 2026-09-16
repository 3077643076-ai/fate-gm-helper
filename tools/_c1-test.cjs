// 临时验证脚本（C1）：不经过 launcher-user.bat、不弹终端，直接把 NapCat 注入到"副本 QQ"
// 关键点：bat 做的事其实就三件 —— 设 5 个环境变量、写 loadNapCat.js、调 NapCatWinBootMain.exe
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const napcatDir = path.join(process.env.USERPROFILE, 'Downloads', 'NapCat.Shell');
const qqPath = process.argv[2];
const qqNumber = '715218931';

if (!qqPath || !fs.existsSync(qqPath)) {
  console.error('用法: node tools/_c1-test.cjs <QQ.exe 路径>');
  process.exit(1);
}

// 1) 写引导文件（bat 里就这一句）
const mainPath = path.join(napcatDir, 'napcat.mjs').replace(/\\/g, '/');
fs.writeFileSync(
  path.join(napcatDir, 'loadNapCat.js'),
  `(async () => {await import("file:///${mainPath}")})()\n`,
);

// 2) 设环境变量（和 bat 一致）
const env = {
  ...process.env,
  NAPCAT_PATCH_PACKAGE: path.join(napcatDir, 'qqnt.json'),
  NAPCAT_LOAD_PATH: path.join(napcatDir, 'loadNapCat.js'),
  NAPCAT_INJECT_PATH: path.join(napcatDir, 'NapCatWinBootHook.dll'),
  NAPCAT_LAUNCHER_PATH: path.join(napcatDir, 'NapCatWinBootMain.exe'),
  NAPCAT_MAIN_PATH: mainPath,
};

// 3) 直接起 NapCatWinBootMain.exe：detached（脱离本会话）+ windowsHide（不弹终端）+ 输出落日志
const logFile = path.join(napcatDir, 'c1-test.log');
const logFd = fs.openSync(logFile, 'a');
const child = spawn(
  path.join(napcatDir, 'NapCatWinBootMain.exe'),
  [qqPath, path.join(napcatDir, 'NapCatWinBootHook.dll'), qqNumber],
  { cwd: napcatDir, env, detached: true, windowsHide: true, stdio: ['ignore', logFd, logFd] },
);
child.unref();
console.log('已启动 NapCat（脱离会话），pid =', child.pid, '目标 QQ =', qqPath);
console.log('日志:', logFile);
