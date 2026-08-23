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
const skillTemplates = require('./routes/skillTemplates');
const qqBindings = require('./routes/qqBindings');
const kb = require('./routes/kb');

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
      'GET    /api/skill-templates',
      'POST   /api/skill-templates',
      'GET    /api/skill-templates/:id',
      'PUT    /api/skill-templates/:id',
      'DELETE /api/skill-templates/:id',
      'GET    /api/qq-bindings',
      'POST   /api/qq-bindings',
      'GET    /api/kb/status',
      'POST   /api/kb/rebuild',
      'GET    /api/kb/search',
      'POST   /api/kb/advise',
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
app.use('/api/skill-templates', skillTemplates);
app.use('/api/qq-bindings', qqBindings);
app.use('/api/kb', kb);

// 托管前端静态文件（生产模式）
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist, { index: false }));

// SPA fallback：非 API 请求都返回 index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: '接口不存在' });
  const indexPath = path.join(frontendDist, 'index.html');
  if (require('fs').existsSync(indexPath)) {
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
});
