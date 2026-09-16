const express = require('express');
const cors = require('cors');
const path = require('path');

const campaigns = require('./routes/campaigns');
const characterCards = require('./routes/characterCards');
const rounds = require('./routes/rounds');
const battleSheets = require('./routes/battleSheets');
const leylines = require('./routes/leylines');
const leylineAssignments = require('./routes/leylineAssignments');
const characterStatus = require('./routes/characterStatus');
const actionSubmissions = require('./routes/actionSubmissions');
const actionRecords = require('./routes/actionRecords');
const skillTemplates = require('./routes/skillTemplates');
const skillSubmissions = require('./routes/skillSubmissions');
const skillAliases = require('./routes/skillAliases');
const qqBindings = require('./routes/qqBindings');
const kb = require('./routes/kb');
const onebotRoutes = require('./lib/onebot/routes');
const onebotService = require('./lib/onebot/service');

const app = express();
const PORT = process.env.PORT || 8100;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API 导航
app.get('/api', (req, res) => {
  res.json({
    name: 'fate-gm-helper',
    version: '1.0.0',
    endpoints: [
      'GET    /api/campaigns',
      'POST   /api/campaigns',
      'GET    /api/campaigns/selected',
      'GET    /api/campaigns/:id',
      'POST   /api/campaigns/:id/select',
      'DELETE /api/campaigns/:id',
      'GET    /api/character-cards',
      'POST   /api/character-cards',
      'GET    /api/character-cards/:id',
      'DELETE /api/character-cards/:id',
      'PUT    /api/character-cards/:id/retire',
      'PUT    /api/character-cards/:id/unretire',
      'GET    /api/rounds/current',
      'POST   /api/rounds/next',
      'POST   /api/rounds/close-current',
      'GET    /api/rounds/history',
      'GET    /api/battle-sheets',
      'PUT    /api/battle-sheets/:id',
      'DELETE /api/battle-sheets/:id',
      'GET    /api/leylines',
      'POST   /api/leylines',
      'PUT    /api/leylines/:id',
      'DELETE /api/leylines/:id',
      'GET    /api/leyline-assignments',
      'POST   /api/leyline-assignments',
      'POST   /api/leyline-assignments/bulk',
      'POST   /api/character-status',
      'GET    /api/character-status/single',
      'GET    /api/character-status/campaign-round',
      'GET    /api/character-status/character-campaign',
      'POST   /api/action-submissions',
      'GET    /api/action-submissions',
      'GET    /api/action-submissions/stream (SSE)',
      'GET    /api/action-records',
      'PUT    /api/action-records',
      'GET    /api/skill-templates',
      'POST   /api/skill-templates',
      'GET    /api/skill-templates/:id',
      'PUT    /api/skill-templates/:id',
      'DELETE /api/skill-templates/:id',
      'GET    /api/skill-submissions',
      'POST   /api/skill-submissions (玩家提交)',
      'POST   /api/skill-submissions/preview (试解析)',
      'PUT    /api/skill-submissions/:id/items (GM 修正)',
      'POST   /api/skill-submissions/:id/confirm',
      'POST   /api/skill-submissions/:id/discard',
      'DELETE /api/skill-submissions/:id',
      'GET    /api/skill-aliases',
      'POST   /api/skill-aliases',
      'DELETE /api/skill-aliases/:id',
      'GET    /api/qq-bindings',
      'POST   /api/qq-bindings',
      'GET    /api/qq-bindings/campaign/:campaignId',
      'DELETE /api/qq-bindings/:id',
      'GET    /api/kb/status',
      'POST   /api/kb/rebuild',
      'GET    /api/kb/search',
      'POST   /api/kb/advise',
      'GET    /api/onebot/config',
      'PUT    /api/onebot/config',
      'GET    /api/onebot/status',
      'POST   /api/onebot/restart',
    ],
  });
});

// API 路由
app.use('/api/campaigns', campaigns);
app.use('/api/character-cards', characterCards);
app.use('/api/rounds', rounds);
app.use('/api/battle-sheets', battleSheets);
app.use('/api/leylines', leylines);
app.use('/api/leyline-assignments', leylineAssignments);
app.use('/api/character-status', characterStatus);
app.use('/api/action-submissions', actionSubmissions);
app.use('/api/action-records', actionRecords);
app.use('/api/skill-templates', skillTemplates);
app.use('/api/skill-submissions', skillSubmissions);
app.use('/api/skill-aliases', skillAliases);
app.use('/api/qq-bindings', qqBindings);
app.use('/api/kb', kb);
// QQ 指令机器人：连接配置/状态/重启接口（群指令处理不走 HTTP，由 service 直连 NapCat WS）
app.use('/api/onebot', onebotRoutes);

// 引擎路由：同步注册占位（必须在 SPA fallback 之前，否则引擎 GET 会被通配吞掉）
const engineRouter = express.Router();
app.use('/api/engine', engineRouter);

// 引擎模块为 ESM，动态加载后把真实路由挂到占位 router 上
(async () => {
  try {
    const engine = await import('./engine/router.mjs');
    engineRouter.use(engine.default);
    const battleRouter = await import('./engine/battle-router.mjs');
    engineRouter.use(battleRouter.default);
    const agentRouter = await import('./engine/agent-router.mjs');
    // 挂在 /agent 前缀下：agent 路由器内部注册的是 /config /run 等，拼起来 = /api/engine/agent/*
    engineRouter.use('/agent', agentRouter.default);
    // v0.5 AI 助手后台任务：定时收行动 + QQ 消息监听（都按库里的配置来，没配置就是空转）
    agentRouter.startBackground();
    console.log('[engine] /api/engine 路由已挂载（含 agent）');
  } catch (e) {
    console.error('[engine] 挂载失败:', e.message);
  }
})();

// 托管前端静态文件（生产模式）
// 前端静态资源：分发版用 FATE_FRONTEND_DIST 指向内置资源；开发/本机用项目目录
const frontendDist = process.env.FATE_FRONTEND_DIST || path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist, { index: false }));

// SPA fallback：非 API 请求都返回 index.html
// index.html 必须 no-cache：它引用的 JS/CSS 文件名带 hash，缓存旧 html 会加载不到新版前端
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: '接口不存在' });
  const indexPath = path.join(frontendDist, 'index.html');
  if (require('fs').existsSync(indexPath)) {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(indexPath);
  } else {
    res.status(200).send(`
      <html><body style="background:#1a1a2e;color:#e0d8c0;font-family:sans-serif;text-align:center;padding-top:100px">
        <h1>空想圣杯 GM 辅助系统</h1>
        <p>前端尚未构建，请先运行: <code>cd frontend && npm run build</code></p>
        <p>开发模式: <code>cd frontend && npm run dev</code> → <a href="http://localhost:5173" style="color:#6090d0">localhost:5173</a></p>
        <hr style="border-color:#333;width:400px">
        <p>API 列表: <a href="/api" style="color:#6090d0">/api</a></p>
      </body></html>
    `);
  }
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || '服务器错误' });
});

app.listen(PORT, () => {
  console.log(`后端运行在 http://localhost:${PORT}`);
  console.log(`API 列表: http://localhost:${PORT}/api`);
  // QQ 指令机器人：随后端启动（读 app_settings 里的连接配置，未启用则只打一行提示）
  onebotService.start();
});
