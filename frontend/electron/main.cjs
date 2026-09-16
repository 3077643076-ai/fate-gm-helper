// ============================================================
// 空想圣杯 GM 工作台 —— Electron 便携版外壳（SanguoEngine）
//
// 形态：单个 exe 拷到任意目录双击即用，不装 node / 不跑 npm：
//   1. 用 Electron 自带的 node（ELECTRON_RUN_AS_NODE）起 backend-node（隐藏窗口）
//   2. 等 8100 端口就绪 → 开窗口加载 http://127.0.0.1:8100
//   3. 关窗 = 收掉后端（子进程树一起杀，避免留孤儿）
//
// 便携要点（踩过的坑，改动前先读）：
//   - electron-builder 的 portable 目标会把程序解包到 %TEMP% 再跑，
//     所以 __dirname / resourcesPath 都是临时的：**数据必须放 exe 旁边的 data/**，
//     由 FATE_DATA_DIR + FATE_GM_DB_PATH 告诉后端（数据库、NapCat、魔力台账都在那儿）
//   - 打包时 tools/stage-backend.mjs 把 backend 的 node_modules 改名成 nm_payload
//     （electron-builder 会强排除 node_modules），这里启动前改回来
//   - 前端静态资源由 FATE_FRONTEND_DIST 指向内置的 frontend-dist
// ============================================================

const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, shell } = require('electron');
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { resolveDataDir } = require('./data-dir.cjs');

const PORT = Number(process.env.FATE_GM_PORT || 8100);
const APP_URL = `http://127.0.0.1:${PORT}/`;

// 判断是打包运行还是开发运行：打包后有 resources/backend
function resolveLayout() {
  const packagedBackend = path.join(process.resourcesPath, 'backend');
  if (fs.existsSync(packagedBackend)) {
    return {
      packaged: true,
      backendDir: packagedBackend,
      distDir: path.join(process.resourcesPath, 'frontend-dist'),
    };
  }
  const repo = path.resolve(__dirname, '..', '..');
  return {
    packaged: false,
    backendDir: path.join(repo, 'backend-node'),
    distDir: path.join(repo, 'frontend', 'dist'),
  };
}

// exe 真正所在的目录（portable 模式下 PORTABLE_EXECUTABLE_DIR 才有值）
function portableDir() {
  return process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
}

let backendProc = null; // 只收自己拉起来的后端
let logStream = null;
let DATA_DIR = null; // 数据目录（whenReady 里按 data-dir.cjs 的规则定下来）
let LAYOUT = null; // 程序布局（打包/开发两种）
let ownBackend = false; // 后端是不是本程序起的（不是就绝不插手）
let backendExited = false; // 后端异常退了（用来让等待循环立刻结束，别让用户干等 60 秒）
let lastLogLines = []; // 最近几行输出，启动失败时直接弹给用户看，不用去翻日志文件
let quitting = false; // 正在退出（托盘"退出"/系统退出）：此时不隐藏窗口、不自动重启
let restartCount = 0; // 自愈重启次数
let tray = null;
let BUNDLED_NAPCAT = ''; // 发行包里自带的 NapCat 目录（下下来就能扫码登录用），空=没有
const RESTART_DELAY_MS = 3000;

function log(msg) {
  const line = `[${new Date().toLocaleString('zh-CN')}] ${msg}`;
  console.log(line);
  // 留最近 20 行，启动失败时直接弹出来（免得用户还得去翻 exe-launcher.log）
  lastLogLines.push(line);
  if (lastLogLines.length > 20) lastLogLines.shift();
  try {
    if (!logStream) {
      const dir = DATA_DIR || path.join(portableDir(), 'data');
      fs.mkdirSync(dir, { recursive: true });
      logStream = fs.createWriteStream(path.join(dir, 'exe-launcher.log'), { flags: 'a' });
    }
    logStream.write(line + '\n');
  } catch {
    /* 日志失败不影响启动 */
  }
}

function portInUse(port, timeout = 400) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: '127.0.0.1', port });
    const done = (val) => {
      sock.destroy();
      resolve(val);
    };
    sock.setTimeout(timeout);
    sock.on('connect', () => done(true));
    sock.on('timeout', () => done(false));
    sock.on('error', () => done(false));
  });
}

async function waitReady(timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portInUse(PORT)) return true;
    // 后端已经退了就别让用户干等 60 秒（backendProc 会被 exit 回调清空，所以看标志位）
    if (backendExited || (backendProc && backendProc.exitCode !== null)) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function startBackend(layout) {
  const dataDir = DATA_DIR || path.join(portableDir(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  // 把打包时改名的依赖目录改回来（每次解包到临时目录，所以每次都要改）
  const nm = path.join(layout.backendDir, 'node_modules');
  const nmPayload = path.join(layout.backendDir, 'nm_payload');
  if (!fs.existsSync(nm) && fs.existsSync(nmPayload)) {
    try {
      fs.renameSync(nmPayload, nm);
      log('node_modules 已从 nm_payload 还原');
    } catch (e) {
      log(`还原 node_modules 失败：${e.message}`);
    }
  }
  // 自检：关键依赖在不在（遇到过"解包不完整/被杀软拦掉"，结果启动报 MODULE_NOT_FOUND 一脸懵）
  if (layout.packaged) {
    for (const dep of ['express', 'body-parser', 'better-sqlite3']) {
      if (!fs.existsSync(path.join(nm, dep))) {
        log(`⚠️ 依赖缺失：node_modules/${dep} —— 解包可能不完整（杀软拦截/磁盘问题），请重开一次或重新解压 exe`);
      }
    }
  }

  backendExited = false;
  log(`启动后端：${layout.backendDir}（数据目录 ${dataDir}）`);
  backendProc = spawn(process.execPath, ['index.js'], {
    cwd: layout.backendDir,
    windowsHide: true,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(PORT),
      FATE_DATA_DIR: dataDir,
      FATE_GM_DB_PATH: path.join(dataDir, 'gm_helper.db'),
      FATE_FRONTEND_DIST: layout.distDir,
      // 发行包内置的 NapCat（有就告诉后端，登录 QQ 时直接释放使用，不再去 GitHub 下载）
      FATE_NAPCAT_BUNDLED: BUNDLED_NAPCAT,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const pipe = (stream) => {
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => log(chunk.toString().trim()));
  };
  pipe(backendProc.stdout);
  pipe(backendProc.stderr);
  backendProc.on('exit', (code) => {
    log(`后端进程退出（code=${code}）`);
    backendProc = null;
    backendExited = true;
    // 意外退出就自己爬回来（对齐 gm-tray.ps1 的自愈：不是我们主动收的、也不是正在退出）
    if (!quitting && ownBackend && restartCount < 5) {
      restartCount++;
      log(`后端挂了，${RESTART_DELAY_MS / 1000} 秒后自动重启（第 ${restartCount} 次）`);
      setTimeout(() => {
        if (quitting) return;
        startBackend(LAYOUT);
        waitReady(30000).then((ok) => {
          if (ok && win) win.loadURL(APP_URL);
        });
      }, RESTART_DELAY_MS);
    }
  });
}

function stopBackend() {
  if (!backendProc || backendProc.exitCode !== null) return;
  const pid = backendProc.pid;
  log(`收后端（pid=${pid}）`);
  try {
    // 用 /T 连带子进程（后端可能拉起 NapCat），/F 强制
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => {});
  } catch (e) {
    log(`收后端失败：${e.message}`);
  }
  backendProc = null;
}

let win = null;

// ---------- 系统托盘（对齐 gm-tray.ps1 的体验：右下角常驻，双击打开工作台） ----------
function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
}

function restartBackend() {
  if (!ownBackend) {
    log('后端不是本程序起的（可能来自托盘/命令行），不在这里重启');
    return;
  }
  log('手动重启后端');
  restartCount = 0;
  stopBackend();
  setTimeout(() => {
    startBackend(LAYOUT);
    waitReady(30000).then((ok) => {
      if (ok && win) win.loadURL(APP_URL);
    });
  }, 800);
}

function createTray() {
  // 图标走 frontend/electron/tray.png（32×32，和 gm-tray.ps1 同一套画法，打进 asar）
  const iconPath = path.join(__dirname, 'tray.png');
  let img = nativeImage.createFromPath(iconPath);
  if (img.isEmpty()) {
    log(`托盘图标读取失败（${iconPath}），退回应用图标`);
    img = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png'));
  }
  try {
    tray = new Tray(img.resize({ width: 16, height: 16 }));
  } catch (e) {
    log(`创建托盘图标失败：${e.message}`);
    return;
  }
  tray.setToolTip('空想圣杯 GM 工作台');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开工作台', click: () => showWindow() },
    { label: '重启后端', click: () => restartBackend() },
    { type: 'separator' },
    {
      label: '退出（关闭后端）',
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]));
  tray.on('double-click', () => showWindow());
  tray.on('click', () => showWindow());
  log('系统托盘已创建（双击/单击图标打开工作台，右键菜单可重启后端或退出）');
}

// 后端就绪后弹个气泡（对齐 gm-tray.ps1 的 ShowBalloonTip）
function notifyReady() {
  if (!tray) return;
  try {
    tray.displayBalloon({
      title: 'GM 工作台',
      content: '后端已就绪，双击右下角图标打开工作台；关窗口只是收进托盘。',
    });
  } catch (e) {
    log(`气泡提示失败：${e.message}`);
  }
}

// 后端起来前的过渡页（避免白屏，也告诉用户"在起后端"）
const LOADING_HTML = `data:text/html;charset=utf-8,${encodeURIComponent(`
<html><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
background:#f5f6f8;color:#2c3e50;font-family:'Microsoft YaHei',sans-serif">
<div style="text-align:center">
  <div style="font-size:18px;font-weight:600;color:#1f3a5f">空想圣杯 GM 工作台</div>
  <div style="margin-top:10px;font-size:13px;color:#6b7785">正在启动后端…</div>
</div></body></html>`)}`;

async function createWindow(layout, alreadyRunning) {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    title: '空想圣杯 GM 工作台',
    backgroundColor: '#f5f6f8',
    autoHideMenuBar: true,
    show: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.on('closed', () => {
    win = null;
  });
  // 点关闭按钮 = 收进托盘（后端继续跑），真正退出走托盘菜单的"退出"
  win.on('close', (e) => {
    if (!quitting && tray) {
      e.preventDefault();
      win.hide();
      log('窗口已收进托盘（后端继续运行；要停就右键托盘图标 → 退出）');
    }
  });
  // 外链一律交给系统浏览器，窗口里只留工作台本身
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (alreadyRunning) {
    log(`8100 已有服务在跑，直接连现成的（退出时不会去动它）`);
  } else {
    await win.loadURL(LOADING_HTML);
    const ok = await waitReady();
    if (!ok) {
      log('后端启动失败或超时');
      dialog.showMessageBoxSync(win, {
        type: 'error',
        title: '后端启动失败',
        message: '后端没能起来（详见下面的最近日志）',
        detail: `${lastLogLines.slice(-8).join('\n')}\n\n完整日志：${path.join(DATA_DIR || '', 'exe-launcher.log')}`,
      });
      app.quit();
      return;
    }
    log('后端就绪，加载工作台');
  }
  await win.loadURL(APP_URL);
}

// 单实例：已经开着就聚焦现有窗口（避免两个 exe 抢 8100）
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showWindow();
  });

  app.whenReady().then(async () => {
    const layout = resolveLayout();
    LAYOUT = layout;
    const data = resolveDataDir({
      packaged: layout.packaged,
      exeDir: portableDir(),
      backendDir: layout.backendDir,
      env: process.env,
    });
    DATA_DIR = data.dir;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
      log(`创建数据目录失败：${e.message}`);
    }
    log(`启动：打包模式=${layout.packaged}`);
    log(`数据目录：${DATA_DIR}（${data.reason}）`);
    // 发行包里自带的 NapCat：exe 旁边的 napcat/（发行 zip 就长这样）
    // 或 resources/napcat（万一以后改成打进 exe）
    const napcatLaunchers = ['NapCatWinBootMain.exe', 'napcat.bat', 'launcher.bat', 'launcher-user.bat'];
    BUNDLED_NAPCAT = [path.join(portableDir(), 'napcat'), path.join(process.resourcesPath, 'napcat')]
      .find((d) => napcatLaunchers.some((f) => { try { return fs.existsSync(path.join(d, f)); } catch { return false; } })) || '';
    log(BUNDLED_NAPCAT ? `随包内置的 NapCat：${BUNDLED_NAPCAT}` : '随包没有内置 NapCat（登录 QQ 时会用本机已有的，或去下载）');
    // 托盘先立起来（图标立刻出现），窗口随后再等后端
    createTray();
    const alreadyRunning = await portInUse(PORT);
    if (!alreadyRunning) {
      ownBackend = true;
      startBackend(layout);
    } else {
      // 端口上已经有后端（比如托盘那套或开发时的 npm start）：当现成的用，不抢也不杀
      log('检测到 8100 已被占用：直接连现成的后端（退出时不会去动它）');
    }
    await createWindow(layout, alreadyRunning);
    notifyReady();
    // 自测用：设了 FATE_GM_AUTO_QUIT_MS 就在 N 毫秒后走一遍正常退出流程（验证收后端）
    const autoQuitMs = Number(process.env.FATE_GM_AUTO_QUIT_MS || 0);
    if (autoQuitMs > 0) {
      log(`自测模式：${autoQuitMs} 毫秒后自动退出`);
      setTimeout(() => {
        quitting = true;
        app.quit();
      }, autoQuitMs);
    }
  });

  // 关窗口只是收进托盘，所以这里不该随"没有窗口"就退出；真退出走托盘菜单/before-quit
  app.on('window-all-closed', () => {
    if (quitting) app.quit();
  });

  app.on('before-quit', () => {
    quitting = true;
    stopBackend();
  });
}
