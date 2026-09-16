<script setup>
// 应用壳：按草图骨架 = 顶栏（标题 + 四大主 tab）+ 战役选择条 + 内容区
// 速查浮窗挂全局（战役/战斗页都要用）
import { onMounted } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useCurrentCampaign } from './composables/useCurrentCampaign'
import QuickSearch from './components/QuickSearch.vue'

const route = useRoute()
const { campaigns, current, init, switchTo } = useCurrentCampaign()

// 四大主 tab（草图：战役 | 战斗 | 小工具 | 设置）
const mainTabs = [
  { key: 'campaign', label: '战役', to: '/campaign' },
  { key: 'battle', label: '战斗', to: '/battle' },
  { key: 'tools', label: '小工具', to: '/tools' },
  { key: 'settings', label: '设置', to: '/settings' },
]

onMounted(init)
</script>

<template>
  <div class="app">
    <!-- 顶栏第一行：标题 + 主 tab + 速查 -->
    <header class="topbar">
      <div class="topbar-inner">
        <RouterLink to="/campaign" class="brand">空想圣杯 GM 工作台</RouterLink>
        <nav class="main-tabs">
          <RouterLink
            v-for="tab in mainTabs"
            :key="tab.key"
            :to="tab.to"
            class="main-tab"
            :class="{ active: route.path === tab.to || route.path.startsWith(tab.to + '/') }"
          >{{ tab.label }}</RouterLink>
        </nav>
      </div>
    </header>

    <!-- 顶栏第二行：选择战役（草图：所有页面都有） -->
    <div class="campaign-bar">
      <div class="campaign-bar-inner">
        <label class="campaign-label">
          选择战役
          <select
            class="select"
            :value="current?.id ?? ''"
            @change="switchTo(Number($event.target.value))"
          >
            <option v-if="!campaigns.length" value="">（暂无战役）</option>
            <option v-for="c in campaigns" :key="c.id" :value="c.id">
              #{{ c.id }} {{ c.name }}
            </option>
          </select>
        </label>
        <span v-if="current" class="campaign-current">{{ current.description || '' }}</span>
      </div>
    </div>

    <RouterView />
    <QuickSearch />
  </div>
</template>

<style scoped>
.app { min-height: 100vh; display: flex; flex-direction: column; }

/* 顶栏：藏蓝纯色（第一行）；吸顶固定，滚动时不消失 */
.topbar {
  position: sticky;
  top: 0;
  z-index: 40;
  background: var(--c-primary);
  border-bottom: 1px solid var(--c-line-strong);
}
.topbar-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 1.4rem;
  display: flex;
  align-items: center;
  gap: 2rem;
  height: 46px;
}
.brand {
  color: #fff;
  font-weight: 700;
  font-size: 1rem;
  letter-spacing: 0.02em;
}

/* 主 tab：文字型，选中 = 浅底 */
.main-tabs { display: flex; gap: 0.3rem; height: 100%; }
.main-tab {
  display: flex;
  align-items: center;
  padding: 0 1.1rem;
  color: rgba(255, 255, 255, 0.82);
  font-size: 0.95rem;
}
.main-tab:hover { color: #fff; background: rgba(255, 255, 255, 0.08); }
.main-tab.active {
  background: var(--c-paper);
  color: var(--c-primary);
  font-weight: 600;
  border-radius: var(--radius) var(--radius) 0 0;
}

/* 战役选择条（第二行，纸面白底）；跟顶栏一起吸顶，两行合计 92px，
   下方页面的固定侧栏用这个值定位（CampaignPage/SettingsPage） */
.campaign-bar {
  position: sticky;
  top: 46px;
  z-index: 39;
  height: 46px;
  display: flex;
  align-items: center;
  background: var(--c-paper);
  border-bottom: 1px solid var(--c-line);
}
.campaign-bar-inner {
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 1.4rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}
.campaign-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.86rem;
  color: var(--c-ink-2);
}
.campaign-current {
  font-size: 0.82rem;
  color: var(--c-ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
