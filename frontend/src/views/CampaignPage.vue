<template>
  <div class="campaign-page">
    <!-- 全局回合状态条（草图：第 N 回合 · 状态 · 下一时段 · 开启/关闭收行动） -->
    <div class="round-bar sheet">
      <span class="round-title">
        <span class="dot" :class="round && round.status === 'OPEN' ? 'ok' : 'off'" />
        第 {{ round?.turnNumber ?? '—' }} 回合
        <span class="round-status">{{ round?.status === 'OPEN' ? '正在收集行动' : (round ? '收行动已关闭' : '暂无回合') }}</span>
      </span>
      <span class="round-actions">
        <button class="btn small" :disabled="advancing || !current" @click="doAdvance" title="引擎前置检查 → 结算 → 进入下一时段">
          {{ advancing ? '推进中…' : '下一时段' }}
        </button>
        <button v-if="!round || round.status !== 'OPEN'" class="btn small" :disabled="roundBusy || !current" @click="openRound">
          开启收行动（新回合）
        </button>
        <button v-else class="btn small" :disabled="roundBusy || !current" @click="closeRound">
          关闭收行动
        </button>
      </span>
      <p v-if="advanceMsg" class="advance-msg">{{ advanceMsg }}</p>
    </div>

    <!-- 左侧页签 + 内容区 -->
    <div class="campaign-body">
      <nav class="side-nav">
        <button
          v-for="tab in subTabs"
          :key="tab.key"
          class="side-tab"
          :class="{ active: activeTab === tab.key }"
          @click="go(tab.key)"
        >{{ tab.label }}</button>
      </nav>

      <main class="side-content">
        <component :is="activeComponent" />
      </main>
    </div>
  </div>
</template>

<script setup>
// 战役 tab 壳：左侧 8 个次级页签（草图 01-08）+ 顶部全局回合状态条
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCurrentCampaign } from '../composables/useCurrentCampaign'
import { getCurrentRound, closeCurrentRound, createNextRound } from '../services/round'
import { advanceEngine } from '../services/engine'

import PreSettlement from '../components/campaign/PreSettlement.vue'
import ActionSettlement from '../components/campaign/ActionSettlement.vue'
import InfoSettlement from '../components/campaign/InfoSettlement.vue'
import ManaSettlement from '../components/campaign/ManaSettlement.vue'
import RoundSettlement from '../components/campaign/RoundSettlement.vue'
import InstantSettlement from '../components/campaign/InstantSettlement.vue'
import HistoryActions from '../components/campaign/HistoryActions.vue'
import LeylinePanel from '../components/campaign/LeylinePanel.vue'

const route = useRoute()
const router = useRouter()
const { current } = useCurrentCampaign()

// 次级页签（顺序即草图的结算流程顺序）
const subTabs = [
  { key: 'settle-pre', label: '结算前', component: PreSettlement },
  { key: 'action', label: '行动结算', component: ActionSettlement },
  { key: 'info', label: '信息结算', component: InfoSettlement },
  { key: 'mana', label: '魔力结算', component: ManaSettlement },
  { key: 'round', label: '轮次结算', component: RoundSettlement },
  { key: 'instant', label: '及时结算', component: InstantSettlement },
  { key: 'history', label: '历史行动', component: HistoryActions },
  { key: 'leylines', label: '灵脉', component: LeylinePanel },
]

const activeTab = computed(() => {
  const key = route.params.subTab || 'settle-pre'
  return subTabs.some(t => t.key === key) ? key : 'settle-pre'
})
const activeComponent = computed(() => subTabs.find(t => t.key === activeTab.value)?.component)

function go(key) {
  router.push(`/campaign/${key}`)
}

// ---------- 回合状态条 ----------
const round = ref(null)
const roundBusy = ref(false)
const advancing = ref(false)
const advanceMsg = ref('')

async function refreshRound() {
  if (!current.value?.id) { round.value = null; return }
  try {
    // /rounds/current 返回 { round: { turnNumber, status, ... } }，取内层
    const data = await getCurrentRound(current.value.id)
    round.value = data?.round || null
  } catch {
    round.value = null
  }
}

// 开启收行动 = 创建新回合
async function openRound() {
  roundBusy.value = true
  try {
    await createNextRound(current.value.id)
    await refreshRound()
  } catch (e) {
    advanceMsg.value = `开启失败：${e.message}`
  } finally {
    roundBusy.value = false
  }
}

// 关闭收行动 = 关闭当前回合并生成快照
async function closeRound() {
  roundBusy.value = true
  try {
    await closeCurrentRound(current.value.id)
    await refreshRound()
  } catch (e) {
    advanceMsg.value = `关闭失败：${e.message}`
  } finally {
    roundBusy.value = false
  }
}

// 下一时段 = 引擎推进（前置检查 → 结算 → 报告）
async function doAdvance() {
  advancing.value = true
  advanceMsg.value = ''
  try {
    const result = await advanceEngine(current.value.id)
    advanceMsg.value = result?.report || '已推进到下一时段'
    await refreshRound()
  } catch (e) {
    advanceMsg.value = `推进被拦下：${e.message}`
  } finally {
    advancing.value = false
  }
}

watch(() => current.value?.id, refreshRound, { immediate: true })
onMounted(refreshRound)
</script>

<style scoped>
/* 回合状态条：跟在吸顶双栏（92px）下面 */
.round-bar {
  margin: 0.9rem 1.4rem 0.9rem calc(140px + 1.4rem);
  padding: 0.55rem 1rem;
  display: flex;
  align-items: center;
  gap: 1.2rem;
  flex-wrap: wrap;
}
.round-bar.sheet { margin-bottom: 0; }
.round-title { font-weight: 600; font-size: 0.92rem; }
.round-status { font-weight: 400; color: var(--c-ink-2); margin-left: 0.4rem; font-size: 0.85rem; }
.round-actions { display: flex; gap: 0.5rem; }
.advance-msg {
  flex-basis: 100%;
  margin: 0;
  font-size: 0.82rem;
  color: var(--c-ink-2);
  white-space: pre-wrap;
}

/* 布局：左侧栏贴屏幕左缘固定（吸顶双栏下方满高），内容区在右侧滚动 */
.campaign-body {
  display: flex;
  align-items: flex-start;
}

/* 固定侧栏：贴左缘、满高、白底 + 右边界线；sticky 保证滚动时钉在原地 */
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
