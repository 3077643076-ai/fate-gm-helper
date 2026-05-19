import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import BattleControl from '../views/BattleControl.vue'
import BattleSheet from '../views/BattleSheet.vue'
import CharacterCardUpload from '../views/CharacterCardUpload.vue'
import SkillRecord from '../views/SkillRecord.vue'

const routes = [
  { path: '/', name: 'home', component: Home },
  { path: '/battle-control/:campaignId?', name: 'battle-control', component: BattleControl },
  { path: '/battle-sheet', name: 'battle-sheet', component: BattleSheet },
  { path: '/character-card-upload/:campaignId?', name: 'character-card-upload', component: CharacterCardUpload },
  { path: '/dashboard-campaign', redirect: '/battle-control' },
  { path: '/skill-record', name: 'skill-record', component: SkillRecord },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router

