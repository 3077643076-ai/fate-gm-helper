<template>
  <section class="page-card">
    <h1 class="page-title">Fate GM助手</h1>
    <p class="page-subtitle">请选择一个模块开始</p>
    <div class="nav-grid">
      <RouterLink class="nav-tile battle" to="/battle-control">
        <span>战斗控制</span>
        <small>管理战斗流程</small>
      </RouterLink>
      <RouterLink class="nav-tile sheet" to="/battle-sheet">
        <span>战斗表格</span>
        <small>记录战斗数据</small>
      </RouterLink>
      <RouterLink class="nav-tile card" to="/character-card-upload">
        <span>角色卡上传</span>
        <small>维护角色卡片</small>
      </RouterLink>
      <RouterLink class="nav-tile dashboard" to="/battle-control">
        <span>战役控制</span>
        <small>回合管理、灵脉配置、行动记录</small>
      </RouterLink>
      <RouterLink class="nav-tile skill" to="/skill-record">
        <span>技能记录</span>
        <small>跳转到战斗控制页</small>
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
.nav-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}
@media (max-width: 520px) {
  .nav-grid {
    grid-template-columns: 1fr;
  }
}

.nav-tile {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 1.25rem 1.2rem;
  border-radius: 0.75rem;
  color: #fff;
  font-weight: 600;
  font-size: 1.1rem;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
  opacity: 0.96;
  min-height: 80px;
  justify-content: center;
}

.nav-tile small {
  font-weight: 500;
  font-size: 0.85rem;
  opacity: 0.85;
}

.nav-tile:hover {
  transform: translateY(-3px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
  opacity: 1;
}

.nav-tile.battle { background: linear-gradient(135deg, #ff6b6b, #e17055); }
.nav-tile.sheet { background: linear-gradient(135deg, #0984e3, #74b9ff); }
.nav-tile.card { background: linear-gradient(135deg, #00b894, #55efc4); }
.nav-tile.dashboard { background: linear-gradient(135deg, #6c5ce7, #a29bfe); }
.nav-tile.skill { background: linear-gradient(135deg, #fdcb6e, #f6b93b); color: #2d3436; }
.nav-tile.skill small { color: #2d3436; }
</style>

