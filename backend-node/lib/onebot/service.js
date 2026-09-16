// OneBot 指令机器人组装层
// 职责：从数据库读连接配置 -> 启动 wsBot 连 NapCat -> 群消息交给 commands 分发 -> 状态查询/重启
// 配置存在主库 app_settings 表（key = onebot_bot_config），网页端"机器人连接"页读写的就是这里

const { join, dirname } = require('node:path');
const { getDb } = require('../../db');
const { dataFile } = require('../data-dir');
const { startOnebotBot } = require('./wsBot');
const { createCommandHandler } = require('./commands');

// 配置在 app_settings 表里的 key
const CONFIG_KEY = 'onebot_bot_config';
// 魔力转让台账（.转魔 指令追加写入的 JSONL 文件）
const transferLogPath = dataFile('magic-transfers.jsonl');

// 当前运行中的机器人实例（含 wsBot 句柄）；null = 未启动
let bot = null;
// 最近一次启动时用的配置（自增 ID 之类没有，这里只存连接参数快照，便于排查）
let runningConfig = null;

// ---------- 配置读写 ----------

// 默认配置：没配置过时给一个空配置（enabled=false 不会自动连接）
const DEFAULT_CONFIG = {
  enabled: false,
  wsUrl: 'ws://127.0.0.1:3001',
  accessToken: '',
  selfId: '',
  // NapCat 托管：本机 NapCat 解压目录 + WebUI 端口（海豹式网页扫码登录用）
  napcatDir: '',
  // 留空 = 注入本机 QQ（此时 GM 自己的 QQ 得先退）；填了就用那份 QQ（独立环境，可并存）
  qqPath: '',
  napcatWebuiPort: 6099,
  // 静音模式：true 时拦截一切"向群发消息"的动作（回执/催交/指令回复全不出门），
  // 只读操作（读公告/群列表等）不受影响
  muted: false,
};

// 发送类动作判断：send_group_msg / _send_group_notice 等
function isSendAction(action) {
  return /^(_?send_)/.test(String(action || ''));
}

function readConfig(db) {
  const row = db.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?').get(CONFIG_KEY);
  if (!row || !row.setting_value) return { ...DEFAULT_CONFIG };
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(row.setting_value) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(db, partial) {
  const merged = { ...readConfig(db), ...partial };
  db.prepare(`
    INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = datetime('now')
  `).run(CONFIG_KEY, JSON.stringify(merged));
  return merged;
}

// ---------- 启动 / 停止 ----------

function start() {
  const db = getDb();
  const config = readConfig(db);
  stop(); // 防止重复启动

  if (!config.enabled || !config.wsUrl) {
    console.log('[onebot] 指令机器人未启用（网页端"机器人连接"页可开启）');
    return;
  }

  // 静音拦截器：muted 时拦截一切发送类动作（读公告等只读操作放行）
  const guard = (action) => {
    if (config.muted && isSendAction(action)) {
      const err = new Error(`[静音模式] 已拦截 ${action}，消息未发出`);
      err.muted = true;
      return err;
    }
    return null;
  };

  const handler = createCommandHandler({
    // OneBot 动作走 wsBot 的 WS 连接（静音时发送类被拦，指令回复静默丢弃）
    callOnebot: (action, params) => {
      const blocked = guard(action);
      if (blocked) {
        console.log(`[onebot] ${blocked.message}`);
        return Promise.reject(blocked);
      }
      return bot.call(action, params);
    },
    // 战役数据操作走本机 HTTP API（与原 fate-actions 插件调 apiBase 等价）
    callBackend: callLocalBackend,
    getSelfId: () => runningConfig?.selfId || '',
    transferLogPath,
  });

  bot = startOnebotBot({
    wsUrl: config.wsUrl,
    accessToken: config.accessToken || undefined,
    onEvent: (event) => handler.handleEvent(event),
    onStatus: ({ connected, note }) => {
      // 状态变化只打一行日志，刷屏级别的逐条消息日志交给 engine 的 message_log
      if (!connected) console.log(`[onebot] ${note}`);
    },
  });

  runningConfig = config;
  console.log(`[onebot] 指令机器人已启动 -> ${config.wsUrl}${config.selfId ? `（selfId: ${config.selfId}）` : ''}${config.muted ? '【静音中：只读不发】' : ''}`);
  // 把 WS 调用器注入 engine 的 qqport：读公告/催交/AI 收行动优先走 WS（实测比 HTTP 稳）
  // 同样过静音拦截器：AI 代收的回执/催办、一键催交在静音时全被拦（收行动不受影响）
  import('../../engine/qqport.mjs')
    .then((qqport) => {
      qqport.setWsCaller((action, params) => {
        if (!bot) return Promise.reject(new Error('机器人未启动'));
        const blocked = guard(action);
        if (blocked) {
          console.log(`[qqport] ${blocked.message}`);
          return Promise.reject(blocked);
        }
        return bot.call(action, params);
      });
    })
    .catch((e) => console.error(`[onebot] 注入 WS 调用器失败: ${e.message}`));
}

function stop() {
  if (bot) {
    bot.stop();
    bot = null;
  }
  runningConfig = null;
}

// 配置变化后的重启入口（routes.js 的 PUT /config 和 POST /restart 都走这里）
function restart() {
  start();
}

// 踢一脚：机器人未连接时让它立即尝试重连（跳过退避等待）
// 场景：用户刚扫完码，NapCat 的 WS 服务刚开，让连接在 1-2 秒内建立，
// 而不是等重连退避倒计时（最长 15 秒）
function poke() {
  if (bot && !bot.getStatus().connected) {
    bot.reconnectNow();
  }
}

// ---------- 状态查询 ----------

function getStatus() {
  const db = getDb();
  const config = readConfig(db);
  return {
    enabled: config.enabled,
    wsUrl: config.wsUrl,
    selfId: config.selfId || '',
    muted: !!config.muted,
    // token 不回传明文，只回传有没有配置
    hasAccessToken: Boolean(config.accessToken),
    connected: bot ? bot.getStatus().connected : false,
    note: bot ? bot.getStatus().note : '未启动',
    transferLogPath,
  };
}

// ---------- 本机后端 HTTP 调用 ----------

// 后端自身监听的端口（index.js 同款取值；不同端口部署时可通过 PORT 环境变量覆盖）
const backendPort = process.env.PORT || 8100;

// 调本机后端 API。path 形如 '/qq-bindings'（自动拼 http://127.0.0.1:port/api 前缀）
// 出错时抛 Error（带后端返回的 error 文案），供指令处理器拼提示语
async function callLocalBackend(method, path, { query, body } = {}) {
  const url = new URL(`http://127.0.0.1:${backendPort}/api${path}`);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

// 确保 data 目录存在（转魔台账写在这里）
try { mkdirSafe(dirname(transferLogPath)); } catch { /* 启动时目录创建失败不阻断进程 */ }
function mkdirSafe(dir) {
  require('node:fs').mkdirSync(dir, { recursive: true });
}

module.exports = { start, stop, restart, poke, getStatus, readConfig, writeConfig, CONFIG_KEY };
