import { createRouter, createWebHistory } from 'vue-router'
import BattleControl from '../views/BattleControl.vue'
import BattleSheetPage from '../views/BattleSheetPage.vue'
import CharacterCardUpload from '../views/CharacterCardUpload.vue'
import SkillRecord from '../views/SkillRecord.vue'
import SkillTemplateManage from '../views/SkillTemplateManage.vue'
import RuleAdvisor from '../views/RuleAdvisor.vue'
import EngineBattleSheet from '../views/EngineBattleSheet.vue'
import EnginePanel from '../views/EnginePanel.vue'
import BattleHub from '../views/BattleHub.vue'
import SettingsPage from '../views/SettingsPage.vue'
import ToolsPage from '../views/ToolsPage.vue'
import ActionStatsPage from '../views/ActionStatsPage.vue'
import ManaStatsPage from '../views/ManaStatsPage.vue'

const routes = [
  { path: '/', redirect: '/campaign' },
  { path: '/campaign', name: 'campaign', component: EnginePanel },
  { path: '/engine', redirect: '/campaign' }, // 旧路径兼容
  { path: '/battle', name: 'battle', component: BattleHub },
  { path: '/action-stats', name: 'action-stats', component: ActionStatsPage },
  { path: '/mana-stats', name: 'mana-stats', component: ManaStatsPage },
  { path: '/settings', name: 'settings', component: SettingsPage },
  { path: '/tools', name: 'tools', component: ToolsPage },
  { path: '/engine-battle/:battleId?', name: 'engine-battle', component: EngineBattleSheet },
  { path: '/battle-control/:campaignId?', name: 'battle-control', component: BattleControl },
  { path: '/battle-sheet', name: 'battle-sheet', component: BattleSheetPage },
  { path: '/battle-sheet/:campaignId', name: 'battle-sheet-page', component: BattleSheetPage },
  { path: '/character-card-upload/:campaignId?', name: 'character-card-upload', component: CharacterCardUpload },
  { path: '/dashboard-campaign', redirect: '/battle-control' },
  { path: '/skill-record', name: 'skill-record', component: SkillRecord },
  { path: '/skill-templates', name: 'skill-templates', component: SkillTemplateManage },
  { path: '/rule-advisor', name: 'rule-advisor', component: RuleAdvisor },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router

