// 机器人连接管理 API：/api/onebot/*
//   GET  /config        读连接配置（token 不回明文）
//   PUT  /config        写连接配置（保存后自动重连）
//   GET  /status        连接状态（网页端"机器人连接"页轮询）
//   POST /restart       手动重连
//   POST /napcat/launch 拉起本机 NapCat（海豹式托管：预写配置+启动）
//   GET  /napcat/qrcode 尝试取 NapCat 登录二维码（best-effort，失败降级 WebUI 链接）
//   GET  /napcat/status NapCat WebUI 运行状态
// 网页端的机器人连接管理页调用这些接口。

const express = require('express');
const path = require('node:path');
const service = require('./service');
const napcat = require('./napcat');
const { dataFile } = require('../data-dir');

const router = express.Router();

// NapCat 目录解析：配置里填的 → 本机自动发现的（~/Downloads/NapCat.Shell 之类）→ 空
// 为什么要这层兜底：一键登录会自动发现本机已有的 NapCat，但配置里可能还是空的，
// 结果"取二维码/查状态/重启"这些接口全在找一个不存在的目录 —— 表现就是
// "登录按钮点了、NapCat 也起来了，但页面一直不出二维码"（2026-09-16 实测踩到）
function resolveNapcatDir(config) {
  if (config.napcatDir) {
    const hit = napcat.detectInstalled(config.napcatDir);
    if (hit) return hit.dir;
  }
  const local = napcat.detectLocalNapcat();
  if (local) return local.dir;
  return napcat.detectInstalled('')?.dir || config.napcatDir || '';
}

// 从配置生成 NapCat WebUI 的带 token 直达地址（打开就是扫码页）
function buildWebuiUrl(config) {
  const info = napcat.getWebuiInfo(config.napcatDir);
  const port = (info && info.port) || config.napcatWebuiPort || 6099;
  const tokenPart = info && info.token ? `?token=${encodeURIComponent(info.token)}` : '';
  return `http://127.0.0.1:${port}/webui${tokenPart}`;
}

// 读配置
router.get('/config', (_req, res) => {
  const db = require('../../db').getDb();
  const config = service.readConfig(db);
  // accessToken 只回"是否已配置"，不回明文
  res.json({ ...config, accessToken: config.accessToken ? '(已配置)' : '' });
});

// 写配置（部分字段合并；传 accessToken='(已配置)' 表示保持原值不覆盖）
router.put('/config', (req, res) => {
  const db = require('../../db').getDb();
  const { enabled, wsUrl, accessToken, selfId, napcatDir, napcatWebuiPort, muted } = req.body || {};
  const patch = {};
  if (typeof enabled === 'boolean') patch.enabled = enabled;
  if (typeof muted === 'boolean') patch.muted = muted;
  if (typeof wsUrl === 'string') patch.wsUrl = wsUrl.trim();
  if (typeof selfId === 'string') patch.selfId = selfId.trim();
  if (typeof napcatDir === 'string') patch.napcatDir = napcatDir.trim();
  if (typeof req.body?.qqPath === 'string') patch.qqPath = req.body.qqPath.trim();
  if (napcatWebuiPort !== undefined && Number.isFinite(Number(napcatWebuiPort))) {
    patch.napcatWebuiPort = Number(napcatWebuiPort);
  }
  // 占位符 "(已配置)" 表示用户没改 token，保持数据库里的原值
  if (typeof accessToken === 'string' && accessToken !== '(已配置)') {
    patch.accessToken = accessToken.trim();
  }
  const merged = service.writeConfig(db, patch);
  // 配置生效：按新配置重连（muted 切换不需要重启连接，restart 只是重读配置最简单）
  service.restart();
  res.json({ ...merged, accessToken: merged.accessToken ? '(已配置)' : '' });
});

// 连接状态
router.get('/status', (_req, res) => {
  res.json(service.getStatus());
});

// 手动重连
router.post('/restart', (_req, res) => {
  service.restart();
  res.json({ ok: true, status: service.getStatus() });
});

// ---------- NapCat 托管（海豹式扫码登录） ----------

// 一键登录：触发后台全自动流程（没装 NapCat 会自动下载解压 → 预写配置 → 启动）
// 立即返回，进度走 GET /napcat/install/status 轮询
router.post('/napcat/launch', (req, res) => {
  const db = require('../../db').getDb();
  let config = service.readConfig(db);
  // 用户点了"登录机器人"= 明确要启用，自动打开开关（开关在高级选项里，不该挡路）
  if (!config.enabled) {
    config = service.writeConfig(db, { enabled: true });
    service.restart();
  }
  // WS 端口从配置的 wsUrl 里解析（ws://127.0.0.1:3001 → 3001）
  const wsPort = Number(String(config.wsUrl || '').match(/:(\d+)/)?.[1]) || 3001;
  // 顺带打通引擎侧的 NapCat HTTP 地址（查公告/催交/AI 收行动）
  syncAgentNapcatConfig(config.wsUrl);
  const result = napcat.runLoginFlow({
    configuredDir: config.napcatDir || '',
    wsPort,
    wsToken: config.accessToken,
    qqNumber: config.selfId,
    qqPath: config.qqPath || '', // 填了就用独立 QQ 环境（机器人不占 GM 自己的 QQ）
  });
  if (!result.ok && !napcat.flowState.running) {
    return res.status(400).json({ error: result.reason });
  }
  // 自动发现的目录写回配置：后面取二维码/查状态/重启都用同一个目录，不再靠猜
  if (result.ok && result.dir && result.dir !== config.napcatDir) {
    try {
      service.writeConfig(db, { napcatDir: result.dir });
    } catch { /* 写配置失败不影响登录 */ }
  }
  res.json({ ok: true, started: true, hint: '流程已启动，请轮询安装状态和二维码' });
});

// 登录流程状态：下载/解压/启动进度 + NapCat WebUI 是否就绪
// 前端在扫码阶段每 2 秒轮询这里，顺带踢一脚连接检查（NapCat 就绪后立即重连，
// 让"扫码成功 → 页面变绿"的感知在 1-2 秒内完成）
router.get('/napcat/install/status', async (_req, res) => {
  const db = require('../../db').getDb();
  const config = service.readConfig(db);
  const dir = resolveNapcatDir(config);
  const info = dir ? napcat.getWebuiInfo(dir) : null;
  const rootInfo = { dir: dir || null };
  // WebUI 端口：优先已装目录的 webui.json，兜底默认 6099
  const webuiPort = (info && info.port) || 6099;
  const webuiRunning = napcat.flowState.launched ? await napcat.isWebuiRunning(webuiPort) : false;
  // NapCat 已就绪但机器人还没连上 → 踢一脚立即重连
  if (webuiRunning) service.poke();
  res.json({
    ...napcat.installState,
    flowRunning: napcat.flowState.running,
    flowError: napcat.flowState.error,
    installedDir: rootInfo?.dir || null,
    webuiRunning,
    webuiUrl: `http://127.0.0.1:${webuiPort}/webui${info?.token ? `?token=${encodeURIComponent(info.token)}` : ''}`,
  });
});

// 取登录二维码（best-effort）：成功返回 qrcode（dataurl），失败返回 fallback 直达地址
router.get('/napcat/qrcode', async (req, res) => {
  const db = require('../../db').getDb();
  const config = service.readConfig(db);
  const dir = resolveNapcatDir(config);
  if (!dir) return res.status(400).json({ error: 'NapCat 还没就绪' });
  const result = await napcat.getLoginQrcode({ napcatDir: dir });
  if (result.ok) return res.json({ qrcode: result.qrcode });
  const info = napcat.getWebuiInfo(dir);
  const port = (info && info.port) || 6099;
  res.json({
    fallback: `http://127.0.0.1:${port}/webui${info?.token ? `?token=${encodeURIComponent(info.token)}` : ''}`,
    reason: result.reason,
  });
});

// NapCat 状态：WebUI 是否在跑 + 扫码页直达地址
router.get('/napcat/status', async (_req, res) => {
  const db = require('../../db').getDb();
  const config = service.readConfig(db);
  const dir = resolveNapcatDir(config);
  const info = dir ? napcat.getWebuiInfo(dir) : null;
  const running = info ? await napcat.isWebuiRunning(info.port) : false;
  res.json({
    configured: Boolean(dir),
    webuiRunning: running,
    webuiUrl: dir ? `http://127.0.0.1:${(info && info.port) || 6099}/webui${info?.token ? `?token=${encodeURIComponent(info.token)}` : ''}` : null,
  });
});

// 重启 NapCat：onebot11.json 升级（补 HTTP 服务端）后需要重启才生效
router.post('/napcat/restart', async (req, res) => {
  const db = require('../../db').getDb();
  const config = service.readConfig(db);
  const dir = resolveNapcatDir(config);
  if (!dir) return res.status(400).json({ error: 'NapCat 还没安装过' });
  // 重启前顺带把配置再升级一次（幂等），并同步引擎侧 HTTP 地址
  const wsPort = Number(String(config.wsUrl || '').match(/:(\d+)/)?.[1]) || 3001;
  const cfgResult = napcat.ensureOnebotConfig({ napcatDir: dir, wsPort, wsToken: config.accessToken, qqNumber: config.selfId });
  syncAgentNapcatConfig(config.wsUrl);
  const result = await napcat.restartNapcat({ napcatDir: dir, qqNumber: config.selfId });
  if (!result.ok) return res.status(400).json({ error: result.reason });
  res.json({ ok: true, launcher: result.launcher, onebotConfig: cfgResult });
});

// 一键登录成功后自动打通引擎侧配置：napcatHttpBase（查公告/催交/AI 收行动用）
// engine 模块是 ESM，这里动态加载；失败只记日志，不影响登录主流程
function syncAgentNapcatConfig(wsUrl) {
  Promise.all([
    import('../../engine/agent.mjs'),
    import('../../engine/store.mjs'),
  ]).then(([agent, store]) => {
    const dbPath = process.env.FATE_GM_DB_PATH || dataFile('gm_helper.db');
    const engineDb = store.openEngineDb(dbPath);
    agent.setAgentConfig(engineDb, {
      napcatHttpBase: 'http://127.0.0.1:3000',
      napcatWsUrl: wsUrl,
    });
    console.log('[onebot] 已同步 napcatHttpBase 到 AI 助手配置（http://127.0.0.1:3000）');
  }).catch((e) => {
    console.error('[onebot] 同步 agent 配置失败:', e.message);
  });
}


// ---------- 独立 QQ 环境（C1：机器人用自己的那份 QQ，GM 的 QQ 可同时在线） ----------
// 为什么需要：NapCat 注入 QQ 客户端，一个客户端只能登一个号；复制一份给机器人后两边互不相干
// 合规说明：腾讯 QQ 本体不允许随包分发 → 这里只在**用户本机**复制，不进发行包

// QQ 环境状态：本机 QQ 在哪、独立环境准备好没有、当前注入的是哪份
router.get('/napcat/qq-env', (_req, res) => {
  const db = require('../../db').getDb();
  const config = service.readConfig(db);
  const localQq = napcat.detectLocalQqPath();
  const independent = napcat.independentQqPath();
  res.json({
    localQq: localQq || null,
    independentQq: independent,
    independentReady: require('node:fs').existsSync(independent),
    usingQq: config.qqPath || localQq || null,
    usingIndependent: Boolean(config.qqPath),
  });
});

// 准备独立 QQ 环境：把本机 QQ 复制到数据目录（约 1.2GB，SSD 上几秒）
router.post('/napcat/prepare-qq', (req, res) => {
  const db = require('../../db').getDb();
  const result = napcat.prepareIndependentQQ({ force: Boolean(req.body?.force) });
  if (!result.ok) return res.status(400).json({ error: result.reason });
  // 准备好就切到独立 QQ（之后机器人不再占用 GM 自己的 QQ）
  const config = service.writeConfig(db, { qqPath: result.qqPath });
  res.json({ ok: true, ...result, config: { qqPath: config.qqPath } });
});

// 停止机器人（按 PID 精确停，含它自己那份 QQ；不动 GM 的 QQ）
router.post('/napcat/stop', (_req, res) => {
  const db = require('../../db').getDb();
  const config = service.readConfig(db);
  const dir = resolveNapcatDir(config);
  if (!dir) return res.status(400).json({ error: '还没发现 NapCat 目录' });
  const result = napcat.stopNapcatPersistent(dir);
  napcat.flowState.launched = false;
  napcat.installState.message = result.ok ? '机器人已停止' : result.reason;
  service.poke();
  res.json(result);
});
module.exports = router;
