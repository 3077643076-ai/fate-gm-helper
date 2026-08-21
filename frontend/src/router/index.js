import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import BattleControl from '../views/BattleControl.vue'
import BattleSheetPage from '../views/BattleSheetPage.vue'
import CharacterCardUpload from '../views/CharacterCardUpload.vue'
import SkillRecord from '../views/SkillRecord.vue'
import SkillTemplateManage from '../views/SkillTemplateManage.vue'

const routes = [
  { path: '/', name: 'home', component: Home },
  { path: '/battle-control/:campaignId?', name: 'battle-control', component: BattleControl },
  { path: '/battle-sheet', name: 'battle-sheet', component: BattleSheetPage },
  { path: '/battle-sheet/:campaignId', name: 'battle-sheet-page', component: BattleSheetPage },
  { path: '/character-card-upload/:campaignId?', name: 'character-card-upload', component: CharacterCardUpload },
  { path: '/dashboard-campaign', redirect: '/battle-control' },
  { path: '/skill-record', name: 'skill-record', component: SkillRecord },
  { path: '/skill-templates', name: 'skill-templates', component: SkillTemplateManage },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router

