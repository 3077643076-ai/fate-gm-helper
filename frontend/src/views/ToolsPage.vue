<script setup>
// 小工具页：角色卡/技能/规则顾问等独立功能入口 + 命令行工具速查
const tools = [
  { to: '/character-card-upload', title: '角色卡上传', desc: '解析 .st 文本存从者/御主卡，按战役管理、退场/再登场' },
  { to: '/skill-templates', title: '技能模板管理', desc: '结构层（数值/时机/消耗）+ 原文层，战斗表自动套用' },
  { to: '/skill-record', title: '技能记录', desc: '战斗中的技能发动记录' },
  { to: '/rule-advisor', title: '规则顾问（旧）', desc: 'AI 规则问答，参考用，不进结算链' },
  { to: '/battle-control', title: '旧·战斗控制台', desc: '引擎前的老流程（SSE 行动提交），仅回看' },
  { to: '/battle-sheet', title: '旧·Excel 战斗表', desc: '引擎前的老战斗表，仅回看' },
]
const cli = [
  { cmd: 'node tools/mock-napcat.mjs 3000', desc: '假 NapCat：离线测 QQ 公告收集（公告改 tools/mock-napcat.json）' },
  { cmd: 'node backend-node/engine/summary-report.mjs <战役ID> [回合] [时段]', desc: '命令行打行动统计（同面板右栏）' },
  { cmd: 'node backend-node/scripts/seed-action-rules.mjs', desc: '灌 24 条行动口径（幂等）' },
  { cmd: 'node backend-node/scripts/seed-unit-registry.mjs', desc: '按角色名灌单位注册表（幂等，缺卡标 missing）' },
  { cmd: 'node backend-node/scripts/backup-db.js', desc: '备份数据库到 backend-node/backups/' },
]
</script>

<template>
  <div class="page">
    <header class="page-head">
      <h1>小工具</h1>
      <p class="sub">独立功能页与命令行速查</p>
    </header>

    <section class="grid">
      <RouterLink v-for="t in tools" :key="t.to" class="tool-card" :to="t.to">
        <div class="tool-title">{{ t.title }}</div>
        <div class="tool-desc">{{ t.desc }}</div>
        <div class="tool-go">进入 →</div>
      </RouterLink>
    </section>

    <section class="card">
      <div class="card-title">命令行工具</div>
      <div v-for="c in cli" :key="c.cmd" class="cli-row">
        <code>{{ c.cmd }}</code>
        <span class="cli-desc">{{ c.desc }}</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page { padding: 22px 26px; overflow: auto; }
.page-head h1 { margin: 0 0 4px; font-size: 20px; color: #e9edf5; }
.sub { margin: 0 0 16px; color: #7d8392; font-size: 13px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; margin-bottom: 16px; }
.tool-card {
  background: #1e2029; border: 1px solid #2c2f3a; border-radius: 10px;
  padding: 14px 16px; text-decoration: none; color: inherit;
  display: flex; flex-direction: column; gap: 8px; transition: border-color 0.15s, transform 0.15s;
}
.tool-card:hover { border-color: #3f77bd; transform: translateY(-2px); }
.tool-title { font-size: 15px; color: #e2e6ee; font-weight: 600; }
.tool-desc { font-size: 12px; color: #818897; flex: 1; line-height: 1.5; }
.tool-go { font-size: 12px; color: #5a9bd8; }
.card { background: #1e2029; border: 1px solid #2c2f3a; border-radius: 10px; padding: 14px 16px; }
.card-title { font-size: 14px; color: #cdd3df; margin-bottom: 12px; font-weight: 600; }
.cli-row { display: flex; gap: 14px; align-items: baseline; padding: 5px 0; border-bottom: 1px solid #262933; flex-wrap: wrap; }
.cli-row:last-child { border-bottom: none; }
code {
  background: #16171d; border: 1px solid #333744; border-radius: 4px;
  padding: 2px 8px; font-size: 12px; color: #a8c7ec; font-family: Consolas, monospace;
}
.cli-desc { font-size: 12px; color: #7d8392; }
</style>
