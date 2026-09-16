// NapCat 托管模块（海豹式"网页扫码登录"的实现层）
// 职责：
//   1. launch：从工作台拉起本机 NapCat（用户在设置里指定 NapCat 目录）
//   2. ensureOnebotConfig：预写 config/onebot11.json（正向 WS 指向工作台），登录后自动可用
//   3. getWebuiInfo：读 NapCat 的 config/webui.json 拿 token 和端口（官方文档确认的约定）
//   4. getLoginQrcode：尝试调 NapCat WebUI 接口拿登录二维码（best-effort，
//      WebUI 接口非公开文档，失败时前端降级为"打开 NapCat 扫码页"按钮）
// 依据：https://napneko.github.io/config/basic —— webui.json / onebot11.json 的位置与格式

const { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, createWriteStream } = require('node:fs');
const { join } = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { dataFile } = require('../data-dir');
const { copyDirSync } = require('../copy-dir');

// 当前拉起的 NapCat 进程句柄（工作台退出时由 service 统一处理，这里只管启动）
let napcatProc = null;

// ---------- 目录探测 ----------

// 在 NapCat 目录下找 config 目录（有的包解压后带一层子目录，如 NapCat.x.x.Shell/）
function findConfigDir(napcatDir) {
  const direct = join(napcatDir, 'config');
  if (existsSync(direct)) return direct;
  try {
    for (const name of readdirSync(napcatDir)) {
      const sub = join(napcatDir, name, 'config');
      if (existsSync(sub)) return sub;
    }
  } catch { /* 目录不可读就当没有 */ }
  return null;
}

// ---------- OneBot 网络配置预写 ----------

// 预写/升级 onebot11 配置（v4.5.3+ 支持）
// 目标文件优先级：onebot11_<QQ号>.json（账号专属，NapCat 优先读它）> onebot11.json（兜底）
// 内容：正向 WS（指令机器人收发）+ HTTP 服务端（读公告/发消息/催交用）
// 已存在时不整体覆盖，但缺 HTTP/WS 服务端时会自动补上（幂等升级）
function ensureOnebotConfig({ napcatDir, wsPort, wsToken, qqNumber }) {
  const configDir = findConfigDir(napcatDir);
  if (!configDir) return { ok: false, reason: 'NapCat 目录下没找到 config 目录，请确认目录正确' };
  // 有 QQ 号就锁定账号专属文件（NapCat 读它就不读兜底文件了）
  const target = join(configDir, qqNumber ? `onebot11_${qqNumber}.json` : 'onebot11.json');

  const httpServer = {
    name: 'GM工作台HTTP',
    enable: true,
    port: 3000,
    host: '127.0.0.1',
    enableCors: true,
    enableWebsocket: true,
    messagePostFormat: 'array',
    token: wsToken || '',
    debug: false,
  };
  const wsServer = {
    name: 'GM工作台',
    enable: true,
    host: '127.0.0.1',
    port: wsPort,
    messagePostFormat: 'array',
    reportSelfMessage: false,
    token: wsToken || '',
    enableForcePushEvent: true,
    debug: false,
    heartInterval: 30000,
  };

  // 已存在：读入，缺哪块补哪块（不覆盖用户自己加过的其它网络配置）
  if (existsSync(target)) {
    try {
      const cleaned = readFileSync(target, 'utf8').replace(/^\s*\/\/.*$/gm, '');
      const parsed = JSON.parse(cleaned);
      parsed.network = parsed.network || {};
      let changed = false;
      if (!Array.isArray(parsed.network.httpServers) || parsed.network.httpServers.length === 0) {
        parsed.network.httpServers = [httpServer];
        changed = true;
      }
      if (!Array.isArray(parsed.network.websocketServers) || parsed.network.websocketServers.length === 0) {
        parsed.network.websocketServers = [wsServer];
        changed = true;
      }
      if (changed) {
        writeFileSync(target, JSON.stringify(parsed, null, 2), 'utf8');
        return { ok: true, upgraded: true, written: target };
      }
      return { ok: true, skipped: true };
    } catch (e) {
      return { ok: false, reason: `现有 onebot11.json 解析失败（${e.message}），请手工检查或删除它后重试` };
    }
  }

  // 不存在：全新写入
  const payload = {
    network: {
      httpServers: [httpServer],
      httpClients: [],
      websocketServers: [wsServer],
      websocketClients: [],
    },
    musicSignUrl: '',
    enableLocalFile2Url: false,
    parseMultMsg: false,
  };
  try {
    writeFileSync(target, JSON.stringify(payload, null, 2), 'utf8');
    return { ok: true, written: target };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

// ---------- WebUI 信息 ----------

// 读 config/webui.json：{ host, port, token, loginRate }（官方文档确认的结构）
function getWebuiInfo(napcatDir) {
  const configDir = findConfigDir(napcatDir);
  if (!configDir) return null;
  const target = join(configDir, 'webui.json');
  if (!existsSync(target)) return null;
  try {
    const raw = readFileSync(target, 'utf8');
    // webui.json 官方示例带注释（json5），用宽松解析：去掉 // 注释再 parse
    const cleaned = raw.replace(/^\s*\/\/.*$/gm, '');
    const parsed = JSON.parse(cleaned);
    return {
      port: parsed.port || 6099,
      token: parsed.token || '',
      host: parsed.host || '127.0.0.1',
    };
  } catch {
    return null;
  }
}

// 探测 NapCat 是否已在跑（WebUI 端口可达即认为在跑）
async function isWebuiRunning(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1200) });
    return res.status < 500;
  } catch {
    return false;
  }
}

// ---------- 登录二维码 ----------

// 二维码 PNG 文件路径：NapCat 启动未登录时会把它写到 <目录>/cache/qrcode.png
// （实测确认，比 WebUI 未公开接口稳定得多）；过期时 NapCat 会覆盖刷新这个文件
function getQrcodeFilePath(napcatDir) {
  const hit = join(napcatDir, 'cache', 'qrcode.png');
  return existsSync(hit) ? hit : null;
}

/**
 * 取登录二维码（给前端 <img> 显示）：
 *   1) 优先读 cache/qrcode.png 文件（10 分钟内视为有效，返回 mtime 供前端判断是否刷新）
 *   2) 文件没有/太旧 → 尝试 NapCat WebUI 接口（best-effort，接口未公开文档，可能随版本变化）
 */
async function getLoginQrcode({ napcatDir }) {
  // 1) 二维码文件
  const file = getQrcodeFilePath(napcatDir);
  if (file) {
    const stat = statSync(file);
    const ageMin = (Date.now() - stat.mtimeMs) / 60000;
    if (ageMin < 10) {
      const b64 = readFileSync(file).toString('base64');
      return {
        ok: true,
        qrcode: `data:image/png;base64,${b64}`,
        mtime: stat.mtimeMs,
        source: 'file',
      };
    }
  }

  // 2) WebUI 接口兜底
  const info = getWebuiInfo(napcatDir);
  if (!info || !info.token) {
    return { ok: false, reason: '还没拿到二维码（NapCat 启动中？），稍等会自动重试' };
  }
  const base = `http://127.0.0.1:${info.port}`;
  const tokenSha256 = crypto.createHash('sha256').update(info.token).digest('hex');

  // WebUI 登录：token 的 hash 形式不同版本有差异，raw 和 sha256 都试一遍
  let credential = null;
  for (const body of [{ token: tokenSha256 }, { token: info.token }]) {
    try {
      const res = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(2500),
      });
      const data = await res.json().catch(() => null);
      const cred = data?.data?.credential;
      if (data?.code === 0 && cred) { credential = cred; break; }
    } catch { /* 下一种形态再试 */ }
  }
  if (!credential) return { ok: false, reason: 'WebUI 登录失败（token 不匹配或接口版本不同）' };

  try {
    const res = await fetch(`${base}/api/QQLogin/GetQQLoginQcode?credential=${encodeURIComponent(credential)}`, {
      headers: { Authorization: `Bearer ${credential}` },
      signal: AbortSignal.timeout(2500),
    });
    const data = await res.json().catch(() => null);
    const qrcode = data?.data?.qrcode;
    if (qrcode) {
      return {
        ok: true,
        // 带上 dataurl 前缀直接给 <img> 用；接口返回的可能是裸 base64
        qrcode: qrcode.startsWith('data:') ? qrcode : `data:image/png;base64,${qrcode}`,
        source: 'webui',
      };
    }
    return { ok: false, reason: '接口没返回二维码（可能已登录或版本不同）' };
  } catch (e) {
    return { ok: false, reason: `取二维码失败：${e.message}` };
  }
}

// ---------- 进程托管 ----------

// 拉起 NapCat。启动器按优先级探测（实测结论）：
//   launcher-user.bat（Shell 版用户模式，免管理员，实测可用）
//   > napcat.bat / launcher.bat（OneKey 的 bat；launcher.bat 需管理员会自动 UAC）
//   > NapCatWinBootMain.exe（OneKey 引导器，需先跑过 NapCatInstaller）
// QQ 号作为参数传入（快速登录）；没填 QQ 号也能起（首次去 WebUI 扫码）
function launchNapcat({ napcatDir, qqNumber }) {
  if (napcatProc && !napcatProc.killed) {
    return { ok: false, reason: 'NapCat 已在运行（由工作台拉起）' };
  }
  const candidates = [
    { file: 'launcher-user.bat', args: qqNumber ? [String(qqNumber)] : [] },
    { file: 'launcher-win10-user.bat', args: qqNumber ? [String(qqNumber)] : [] },
    { file: 'napcat.bat', args: qqNumber ? [String(qqNumber)] : [] },
    { file: 'launcher.bat', args: qqNumber ? [String(qqNumber)] : [] },
    { file: 'NapCatWinBootMain.exe', args: qqNumber ? [String(qqNumber)] : [] },
  ];
  for (const c of candidates) {
    const full = join(napcatDir, c.file);
    if (!existsSync(full)) continue;
    // 启动器输出用管道写进 launch.log —— **不要用 cmd 的 `>` 重定向**：
    // Node 在 Windows 上会把参数里的内层引号转义成 \"，而 cmd 不认反斜杠转义，
    // 结果是命令解析失败、cmd 秒退（退出码 1）且连日志文件都不会生成。
    // 症状就是"点了登录一直显示等二维码"（2026-09-16 实测踩到，spawn 却返回成功）
    const logFile = join(napcatDir, 'launch.log');
    let logStream = null;
    try {
      logStream = createWriteStream(logFile, { flags: 'a' });
    } catch { /* 日志失败不影响启动 */ }

    const isBat = c.file.endsWith('.bat');
    if (isBat) {
      // .bat 必须经 cmd：整条命令再包一层引号 + windowsVerbatimArguments，避开 Node 的引号转义
      napcatProc = spawn('cmd.exe', ['/c', `""${full}" ${c.args.join(' ')}"`], {
        cwd: napcatDir,
        windowsHide: true,
        windowsVerbatimArguments: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } else {
      napcatProc = spawn(full, c.args, {
        cwd: napcatDir,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }
    if (logStream && napcatProc.stdout && napcatProc.stderr) {
      napcatProc.stdout.pipe(logStream);
      napcatProc.stderr.pipe(logStream);
    }
    napcatProc.on('error', (e) => {
      napcatProc = null;
      flowState.error = `拉起 NapCat 失败：${e.message}`;
    });
    napcatProc.on('exit', () => { napcatProc = null; });
    return { ok: true, launcher: c.file };
  }
  return {
    ok: false,
    reason: '目录里没找到 launcher-user.bat / napcat.bat / NapCatWinBootMain.exe，请确认填的是 NapCat 解压目录',
  };
}

function stopNapcat() {
  if (napcatProc && !napcatProc.killed) {
    try {
      // 关键：用 taskkill /T 杀整棵进程树。launcher.bat(cmd) -> NapCatWinBootMain.exe
      // -> QQ.exe 是三层嵌套，只 kill cmd 会留下孤儿实例继续占端口/登录
      const { execSync } = require('node:child_process');
      execSync(`taskkill /PID ${napcatProc.pid} /T /F`, { stdio: 'ignore', timeout: 10000 });
    } catch { /* 进程可能已退出 */ }
  }
  napcatProc = null;
}

// 重启 NapCat（onebot11.json 改动后需要重启才生效）
async function restartNapcat({ napcatDir, qqNumber }) {
  stopNapcat();
  // 等旧进程完全退出、端口释放
  await new Promise(resolve => setTimeout(resolve, 1500));
  return launchNapcat({ napcatDir, qqNumber });
}

// ---------- 自动下载安装（海豹级傻瓜化：用户零操作，点一个按钮全搞定） ----------

// 安装状态（前端轮询展示进度）：idle=没在装 / downloading / extracting / done / error
const installState = { phase: 'idle', progress: 0, message: '', startedAt: null };

// NapCat 自动安装到的固定位置（工作台数据目录下，不污染用户目录）
// 注意：走 dataFile 而不是 __dirname/data —— 便携 exe 下程序在临时目录，装那儿等于每次都重下
function defaultNapcatRoot() {
  return dataFile('napcat');
}

// 找目录里的启动器（NapCatWinBootMain.exe / napcat.bat / launcher.bat），最多往下探两层
function findLauncher(dir, depth = 0) {
  if (depth > 2) return null;
  let entries = [];
  try { entries = readdirSync(dir); } catch { return null; }
  for (const name of ['NapCatWinBootMain.exe', 'napcat.bat', 'launcher.bat']) {
    if (entries.includes(name)) return { dir, launcher: name };
  }
  for (const name of entries) {
    const hit = findLauncher(join(dir, name), depth + 1);
    if (hit) return hit;
  }
  return null;
}

// 已安装判定：napcatDir 有启动器，或默认位置已装过
function detectInstalled(configuredDir) {
  if (configuredDir) {
    const hit = findLauncher(configuredDir, 0);
    if (hit) return hit;
  }
  return findLauncher(defaultNapcatRoot(), 0);
}

// ---------- 本机已装 NapCat 的自动发现 ----------
// 为什么要有这一步：国内直连 GitHub Release 资产经常"响应 200 但 body 不动"，
// 自动下载会一直卡着（看着就是"点了没反应"）。而用户机器上往往早就装过 NapCat
// （比如 %USERPROFILE%\Downloads\NapCat.Shell），直接复用比下载靠谱得多。
function homeDir() {
  return process.env.USERPROFILE || process.env.HOME || '';
}

// 常见安装位置（固定几个）
function commonNapcatDirs() {
  const home = homeDir();
  return [
    defaultNapcatRoot(),
    home && join(home, 'Downloads', 'NapCat.Shell'),
    home && join(home, 'Downloads', 'NapCat'),
    home && join(home, 'Desktop', 'NapCat.Shell'),
    home && join(home, 'NapCat.Shell'),
    join(__dirname, '..', '..', '..', 'tools', 'napcat'), // 老的手动安装位置
    'C:\\NapCat.Shell',
  ].filter(Boolean);
}

// 扫用户目录下所有名字带 napcat 的文件夹（解压位置五花八门，只能扫）
function scanNapcatDirs() {
  const home = homeDir();
  if (!home) return [];
  const found = [];
  for (const root of [join(home, 'Downloads'), join(home, 'Desktop'), join(home, 'Documents')]) {
    let entries = [];
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (/napcat/i.test(name)) found.push(join(root, name));
    }
  }
  return found;
}

// 在本机找一份能用的 NapCat（返回 {dir, launcher} 或 null）
function detectLocalNapcat() {
  const seen = new Set();
  for (const dir of [...commonNapcatDirs(), ...scanNapcatDirs()]) {
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    const hit = findLauncher(dir, 0);
    if (hit) return hit;
  }
  return null;
}

// 拿 NapCat 最新版本号（GitHub API）；失败返回 null（调用方用兜底 tag）
async function fetchLatestTag() {
  try {
    const res = await fetch('https://api.github.com/repos/NapNeko/NapCatQQ/releases/latest', {
      headers: { 'User-Agent': 'fate-gm-helper' },
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    return data?.tag_name || null;
  } catch {
    return null;
  }
}

// 下载文件（跟随跳转），按 content-length 汇报进度百分比
// 卡住检测：30 秒收不到任何数据就中断这次尝试（GitHub 资产在国内经常"连上但不下数据"，
// 不设这个的话前端进度条会一直停在 0% 让人以为按钮没反应）
async function downloadFile(url, destFile, stallMs = 30000) {
  const controller = new AbortController();
  let watchdog = null;
  const arm = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => controller.abort(new Error(`下载卡住（${stallMs / 1000} 秒没有数据）`)), stallMs);
  };
  try {
    arm();
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal });
    if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
    const total = Number(res.headers.get('content-length')) || 0;
    let received = 0;
    const chunks = [];
    for await (const chunk of res.body) {
      arm();
      chunks.push(chunk);
      received += chunk.length;
      if (total) {
        installState.progress = Math.min(99, Math.round((received / total) * 100));
        installState.message = `下载 NapCat ${installState.progress}%`;
      } else {
        installState.message = `下载 NapCat ${(received / 1024 / 1024).toFixed(1)}MB`;
      }
    }
    writeFileSync(destFile, Buffer.concat(chunks));
  } finally {
    if (watchdog) clearTimeout(watchdog);
  }
}

// GitHub 直连 + 国内镜像（直连不通时按顺序试；镜像只是转发 GitHub 的 URL）
const MIRROR_PREFIXES = [
  '',
  'https://ghproxy.net/',
  'https://gh-proxy.com/',
  'https://ghfast.top/',
];

function withMirrors(url) {
  return MIRROR_PREFIXES.map((p) => (p ? p + url : url));
}

// 用 Windows 自带 tar 解压 zip（Win10 1803+ 自带）；失败兜底 PowerShell Expand-Archive
function extractZip(zipFile, destDir) {
  const { execSync } = require('node:child_process');
  try {
    execSync(`tar -xf "${zipFile}" -C "${destDir}"`, { stdio: 'ignore', timeout: 300000 });
  } catch {
    execSync(
      `powershell -NoProfile -Command Expand-Archive -LiteralPath '${zipFile}' -DestinationPath '${destDir}' -Force`,
      { stdio: 'ignore', timeout: 300000 },
    );
  }
}

/**
 * 确保 NapCat 就绪：已装直接返回；没装就自动下载 + 解压。
 * 包选择：本机装了 QQNT → 用 NapCat.Shell.zip（28MB，注入本机 QQ，launcher-user.bat 免管理员）；
 *        没装 QQNT → 用 OneKey 包（自带 QQ，但要先跑 NapCatInstaller 配置，较重）。
 * @param {string} configuredDir 用户在设置里填的目录（可空）
 * @returns {{dir: string, launcher: string}} 可用的 NapCat 目录和启动器
 */
async function ensureNapcat(configuredDir) {
  // 1) 已经装过（配置目录或工作台数据目录）→ 直接用
  const installed = detectInstalled(configuredDir);
  if (installed) return installed;

  // 1.5) 本机别处已经装过（Downloads/NapCat.Shell 之类）→ 也直接用，别去跟 GitHub 死磕
  const localOne = detectLocalNapcat();
  if (localOne) {
    installState.phase = 'done';
    installState.progress = 100;
    installState.message = `发现本机已有的 NapCat：${localOne.dir}`;
    return localOne;
  }

  // 1.6) 发行包自带的 NapCat（exe 旁边的 napcat/）：释放到数据目录后使用
  // 这样"下下来解压就能扫码登录"，不用联网下载 28MB，也不用自己装
  const bundled = process.env.FATE_NAPCAT_BUNDLED || '';
  if (bundled && existsSync(bundled)) {
    const dest = defaultNapcatRoot();
    if (!findLauncher(dest, 0)) {
      installState.phase = 'extracting';
      installState.progress = 30;
      installState.message = '正在释放随包内置的 NapCat（第一次会慢几秒）…';
      try {
        mkdirSync(dest, { recursive: true });
        // 用 copyDirSync 而不是 fs.cpSync：cpSync 碰到中文目标路径会建到乱码目录里去（见 copy-dir.js 注释）
        const n = copyDirSync(bundled, dest);
        installState.message = `已释放内置 NapCat（${n} 个文件）`;
      } catch (e) {
        installState.message = `释放内置 NapCat 失败：${e.message}`;
      }
    }
    const released = findLauncher(dest, 0);
    if (released) {
      installState.phase = 'done';
      installState.progress = 100;
      installState.message = '已使用随包内置的 NapCat';
      return released;
    }
  }

  // 2) 自动下载安装到默认位置
  installState.phase = 'downloading';
  installState.progress = 0;
  installState.message = '正在获取 NapCat 版本…';
  installState.startedAt = Date.now();
  try {
    const root = defaultNapcatRoot();
    mkdirSync(root, { recursive: true });

    // 本机 QQNT 检测：有就用 Shell 版（轻量 + 免管理员），没有才用 OneKey
    const localQQ = 'C:\\Program Files\\Tencent\\QQNT\\QQ.exe';
    const useShell = existsSync(localQQ);
    const assetName = useShell ? 'NapCat.Shell.zip' : 'NapCat.Shell.Windows.OneKey.zip';

    const tag = (await fetchLatestTag()) || '';
    const bases = [];
    if (tag) bases.push(`https://github.com/NapNeko/NapCatQQ/releases/download/${tag}/${assetName}`);
    // 兜底：不带 tag 的 latest 重定向（GitHub 支持 releases/latest/download/<文件名>）
    bases.push(`https://github.com/NapNeko/NapCatQQ/releases/latest/download/${assetName}`);
    // 每个源都试一遍镜像（直连 → ghproxy → gh-proxy → ghfast）
    const candidates = bases.flatMap(withMirrors);

    const zipFile = join(root, 'napcat-pkg.zip');
    let lastErr = null;
    for (const [i, url] of candidates.entries()) {
      try {
        installState.message = `正在下载 NapCat（源 ${i + 1}/${candidates.length}）…`;
        await downloadFile(url, zipFile);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        installState.message = `源 ${i + 1}/${candidates.length} 失败：${e.message}，换下一个…`;
      }
    }
    if (lastErr) {
      throw new Error(`${lastErr.message}（所有下载源都失败；可手动下载 NapCat 解压后在高级选项里填目录）`);
    }

    // 解压（Shell 直接解到根；OneKey 解到 onekey 子目录避免混在一起）
    installState.phase = 'extracting';
    installState.message = '解压中…';
    const dest = useShell ? root : join(root, 'onekey');
    mkdirSync(dest, { recursive: true });
    extractZip(zipFile, dest);

    // 找启动器
    const hit = findLauncher(root, 0);
    if (!hit) throw new Error('解压完成但没找到启动器（launcher-user.bat / napcat.bat）');

    installState.phase = 'done';
    installState.progress = 100;
    installState.message = 'NapCat 就绪';
    return hit;
  } catch (e) {
    installState.phase = 'error';
    installState.message = `自动安装失败：${e.message}。可手动下载 NapCat 解压后在高级选项里填目录。`;
    throw e;
  }
}

// ---------- 一键登录流程编排（海豹级：点一个按钮，剩下全自动） ----------
// 流程：确保 NapCat 已装（没装自动下载解压）→ 预写 OneBot 配置 → 启动进程 → WebUI 出二维码
// 前端只做两件事：触发 POST /napcat/launch + 轮询 GET /napcat/install/status 和 /napcat/qrcode

const flowState = { running: false, launched: false, error: null, dir: null }

// 读 launch.log 末尾几行（启动失败的现场证据）
function readLaunchLogTail(napcatDir, lines = 6) {
  try {
    const p = join(napcatDir, 'launch.log');
    if (!existsSync(p)) return '（没生成 launch.log）';
    const text = readFileSync(p, 'utf8').trim();
    if (!text) return '（launch.log 是空的）';
    return text.split('\n').slice(-lines).join(' ⏎ ');
  } catch (e) {
    return `（读日志失败：${e.message}）`;
  }
}

// 启动后盯 WebUI 端口：就绪 → 提示可以取码了；超时 → 把 launch.log 末尾塞进 flowState.error
function watchWebuiReady(napcatDir, timeoutMs = 45000) {
  const info = getWebuiInfo(napcatDir);
  const port = (info && info.port) || 6099;
  const startedAt = Date.now();
  const timer = setInterval(async () => {
    try {
      if (await isWebuiRunning(port)) {
        clearInterval(timer);
        installState.message = 'NapCat WebUI 已就绪，正在取二维码…';
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        flowState.error = `NapCat 进程起了但 WebUI(${port}) 一直没就绪。launch.log 末尾：${readLaunchLogTail(napcatDir)}`;
        installState.phase = 'error';
        installState.message = 'NapCat 启动异常（详见页面提示与 launch.log）';
      }
    } catch {
      /* 忽略单次探测失败 */
    }
  }, 2500);
  if (timer.unref) timer.unref();
}

async function runLoginFlow({ configuredDir, wsPort, wsToken, qqNumber }) {
  if (flowState.running) {
    return { ok: false, reason: '登录流程已在进行中，请等当前步骤完成' };
  }
  flowState.running = true;
  flowState.error = null;
  flowState.launched = false;
  try {
    // 第 1 步：确保 NapCat 就绪（内部更新 installState 进度）
    const hit = await ensureNapcat(configuredDir);
    flowState.dir = hit.dir;

    // 第 2 步：预写 OneBot 网络配置（正向 WS 对齐工作台，登录后自动可连）
    // 注意：这里的 qqNumber 是函数入参解构出来的（曾经误写成 opts.qqNumber，
    // 导致整个登录流程在这一行抛 "opts is not defined"，表现就是"点了没反应、二维码不出来"）
    ensureOnebotConfig({ napcatDir: hit.dir, wsPort, wsToken, qqNumber });

    // 第 3 步：启动 NapCat
    installState.message = '启动 NapCat…';
    const launch = launchNapcat({ napcatDir: hit.dir, qqNumber });
    if (!launch.ok && !String(launch.reason || '').includes('已在运行')) {
      throw new Error(launch.reason);
    }
    flowState.launched = true;
    installState.message = 'NapCat 已启动，等二维码出现…';
    // 后台盯着 WebUI 到底起没起来：起不来就把原因写进 flowState（前端显示"登录流程中断：…"），
    // 免得一直停在"等二维码出现…"，让人以为还在加载（2026-09-16 用户反馈）
    watchWebuiReady(hit.dir);
    return { ok: true, dir: hit.dir };
  } catch (e) {
    flowState.error = e.message;
    return { ok: false, reason: e.message };
  } finally {
    flowState.running = false;
  }
}

module.exports = {
  ensureOnebotConfig,
  getWebuiInfo,
  isWebuiRunning,
  getLoginQrcode,
  launchNapcat,
  stopNapcat,
  restartNapcat,
  ensureNapcat,
  installState,
  flowState,
  runLoginFlow,
  detectInstalled,
  detectLocalNapcat,
  findConfigDir,
};
