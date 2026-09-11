<script setup>
// 应用外壳：MAA 风格——左侧图标导航栏 + 右侧内容区，横向并列四个功能页
//   战役处理 /campaign · 战斗 /battle · 设置 /settings · 小工具 /tools
// 旧页面（角色卡/技能/规则顾问/旧战斗）归入小工具与战斗的关联高亮，路由不变
import { useRoute, useRouter } from 'vue-router'
import { computed } from 'vue'

const route = useRoute()
const router = useRouter()

const navItems = [
  { path: '/campaign', label: '战役处理', icon: 'list' },
  { path: '/action-stats', label: '行动统计', icon: 'check' },
  { path: '/mana-stats', label: '魔力统计', icon: 'mana' },
  { path: '/battle', label: '战斗', icon: 'swords' },
  { path: '/settings', label: '设置', icon: 'gear' },
  { path: '/tools', label: '小工具', icon: 'wrench' },
]

// 图标：24x24 线稿（stroke），每组是若干 path 的 d 数据
const ICONS = {
  list: ['M4 6h16', 'M4 12h16', 'M4 18h10'],
  mana: ['M12 3.5c3.2 3.8 5.8 6.9 5.8 9.9a5.8 5.8 0 0 1-11.6 0c0-3 2.6-6.1 5.8-9.9z', 'M9.5 13.5a2.6 2.6 0 0 0 2.2 2.6'],
  check: ['M8 5h8v3H8z', 'M6.5 5H6a1.5 1.5 0 0 0-1.5 1.5V19A1.5 1.5 0 0 0 6 20.5h12a1.5 1.5 0 0 0 1.5-1.5V6.5A1.5 1.5 0 0 0 18 5h-.5', 'M9 13.5l2.2 2.2 4-4.4'],
  swords: ['M4.5 4.5l9.5 9.5', 'M19.5 4.5l-9.5 9.5', 'M12.5 15.5l2.5 2.5', 'M11.5 15.5l-2.5 2.5', 'M6 18l-1.5 1.5', 'M18 18l1.5 1.5'],
  gear: [
    'M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z',
    'M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8',
  ],
  wrench: ['M14.9 6.2a4.2 4.2 0 0 0-5.7 5.5L4 16.9a1.8 1.8 0 0 0 0 2.6l0.5 0.5a1.8 1.8 0 0 0 2.6 0l5.2-5.2a4.2 4.2 0 0 0 5.5-5.7l-2.7 2.7-2.9-2.9z'],
}

// 旧路径归入主导航高亮：战斗表/旧控制台→战斗；卡片/技能/顾问→小工具
const activePath = computed(() => {
  const p = route.path
  if (p.startsWith('/engine-battle') || p.startsWith('/battle-control') || p.startsWith('/battle-sheet')) return '/battle'
  if (p.startsWith('/character-card-upload') || p.startsWith('/skill-') || p.startsWith('/rule-advisor')) return '/tools'
  return navItems.find(n => p.startsWith(n.path))?.path ?? ''
})

function go(p) {
  if (route.path !== p) router.push(p)
}
</script>

<template>
  <div class="app">
    <nav class="shell-rail">
      <div class="rail-logo" title="空想圣杯 GM 辅助">圣</div>
      <button
        v-for="n in navItems" :key="n.path" class="rail-item" :class="{ active: activePath === n.path }"
        :title="n.label" @click="go(n.path)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path v-for="(d, i) in ICONS[n.icon]" :key="i" :d="d" />
        </svg>
        <span>{{ n.label }}</span>
      </button>
      <div class="rail-foot">GM</div>
    </nav>
    <main class="shell-main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  height: 100vh;
  background: #14151a;
  color: #d7dae2;
  font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
}
.shell-rail {
  width: 92px;
  flex-shrink: 0;
  background: #1c1e26;
  border-right: 1px solid #2a2d37;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 14px 0 10px;
  gap: 4px;
}
.rail-logo {
  width: 46px;
  height: 46px;
  margin: 0 auto 14px;
  border-radius: 10px;
  background: linear-gradient(145deg, #2c4a74, #1e2f4a);
  border: 1px solid #3d5a8a;
  color: #cfe0f5;
  font-size: 22px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
}
.rail-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  margin: 2px 10px;
  padding: 9px 0 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #828896;
  font-size: 12px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.rail-item svg { width: 22px; height: 22px; }
.rail-item:hover { color: #b9c1d0; background: #22252f; }
.rail-item.active {
  color: #e9edf5;
  background: #272b38;
  box-shadow: inset 3px 0 0 #5a9bd8;
}
.rail-foot {
  margin-top: auto;
  text-align: center;
  font-size: 10px;
  color: #4d5261;
  letter-spacing: 2px;
  user-select: none;
}
.shell-main {
  flex: 1;
  min-width: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}
</style>
