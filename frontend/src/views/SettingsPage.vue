<template>
  <div class="settings-page">
    <div class="page-head settings-head">
      <h2>设置</h2>
      <p>战役管理、角色卡管理、机器人连接</p>
    </div>

    <!-- 左页签 + 内容（草图设置页：战役管理 / 角色卡管理 / 游戏版本管理） -->
    <div class="settings-body">
      <nav class="side-nav">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="side-tab"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >{{ tab.label }}</button>
      </nav>
      <main class="side-content">
        <component :is="activeComponent" />
      </main>
    </div>
  </div>
</template>

<script setup>
// 设置 tab：战役管理 / 角色卡管理 / 机器人连接（游戏版本管理留占位）
import { ref, computed, onMounted } from 'vue'
import { useCurrentCampaign } from '../composables/useCurrentCampaign'
import CampaignManager from '../components/settings/CampaignManager.vue'
import GroupBindingPanel from '../components/campaign/GroupMappingPanel.vue'
import CharacterCardManager from '../components/settings/CharacterCardManager.vue'
import BotConnection from '../components/settings/BotConnection.vue'

const { refreshList } = useCurrentCampaign()

const tabs = [
  { key: 'campaigns', label: '战役管理', component: CampaignManager },
  { key: 'groups', label: '群绑定', component: GroupBindingPanel },
  { key: 'cards', label: '角色卡管理', component: CharacterCardManager },
  { key: 'bot', label: '机器人连接', component: BotConnection },
]
const activeTab = ref('campaigns')
const activeComponent = computed(() => tabs.find(t => t.key === activeTab.value)?.component)

// 从战役管理页切回来时刷新顶栏战役列表
onMounted(refreshList)
</script>

<style scoped>
/* 标题条：让开固定侧栏的宽度 */
.settings-head { margin: 0.9rem 1.4rem 0.9rem calc(140px + 1.4rem); }

/* 布局：与 CampaignPage 同款——左侧栏贴屏幕左缘固定满高 */
.settings-body { display: flex; align-items: flex-start; }
.side-nav {
  flex: none;
  width: 140px;
  position: sticky;
  top: 92px;
  height: calc(100vh - 92px);
  background: var(--c-paper);
  border-right: 1px solid var(--c-line);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0.9rem 0.5rem;
  box-sizing: border-box;
}
.side-tab {
  text-align: left;
  border: none;
  background: transparent;
  color: var(--c-ink-2);
  font-size: 0.9rem;
  padding: 0.45rem 0.8rem;
  border-radius: var(--radius);
  cursor: pointer;
}
.side-tab:hover { background: var(--c-primary-soft); color: var(--c-primary); }
.side-tab.active {
  background: var(--c-primary-soft);
  color: var(--c-primary);
  font-weight: 600;
}
.side-content {
  flex: 1;
  min-width: 0;
  padding: 1rem 1.4rem 2.5rem;
  max-width: 1140px;
}
</style>
