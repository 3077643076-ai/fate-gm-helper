import { createRouter, createWebHistory } from 'vue-router'
import CampaignPage from '../views/CampaignPage.vue'
import BattlePage from '../views/BattlePage.vue'
import ToolsPage from '../views/ToolsPage.vue'
import SettingsPage from '../views/SettingsPage.vue'

// 新骨架路由：四大主 tab（草图：战役 | 战斗 | 小工具 | 设置）
// 战役 tab 内的 8 个次级页由 CampaignPage 内部按 /campaign/:subTab 切换
const routes = [
  { path: '/', redirect: '/campaign/settle-pre' },
  { path: '/campaign/:subTab?', name: 'campaign', component: CampaignPage },
  { path: '/battle', name: 'battle', component: BattlePage },
  { path: '/tools', name: 'tools', component: ToolsPage },
  { path: '/settings', name: 'settings', component: SettingsPage },
  { path: '/:pathMatch(.*)*', redirect: '/campaign/settle-pre' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router
