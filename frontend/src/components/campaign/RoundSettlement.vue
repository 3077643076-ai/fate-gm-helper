<template>
  <div>
    <div class="page-head">
      <h2>轮次结算 · 每轮魔力供给与消耗</h2>
      <p>对账无误后关闭本回合（生成快照），再开下一回合</p>
    </div>

    <!-- 口径说明（静态规则，来源：规则书 3.3.1 / SOP 口径表） -->
    <div class="grid-two">
      <div class="sheet">
        <h3 class="sheet-title">每轮魔力供给</h3>
        <ul class="rule-list">
          <li>回路补给：御主每轮结束 +回路值</li>
          <li>灵脉补给：每天结束，持有者分配（未指定默认自补）</li>
          <li>圣杯供魔：当前规模 × 10，每天结束直补从者</li>
        </ul>
      </div>
      <div class="sheet">
        <h3 class="sheet-title">每轮消耗结算</h3>
        <ul class="rule-list">
          <li>等级魔耗：从者每天结束 −等级/2；每场战斗结束再 −等级/2</li>
          <li>超上限溢出：每轮末自动移除</li>
          <li>魔力不足：每 −20 → 除回路外全属性 −10 常驻（不低于 5）</li>
        </ul>
      </div>
    </div>

    <!-- 对账操作 -->
    <div class="sheet">
      <h3 class="sheet-title">对账与关回合</h3>
      <p class="sheet-note">
        关闭本回合会生成回合快照（行动、状态、魔力账面留档，可在历史行动页查看）。
        状态效果继承由引擎结算处理，页面不需要 GM 手动搬运。
      </p>
      <button class="btn primary" :disabled="closing || !campaignId || !round" @click="doClose">
        {{ closing ? '关闭中…' : `关闭第 ${round?.turnNumber ?? '—'} 回合并生成快照` }}
      </button>
      <span v-if="closeMsg" class="sheet-note">{{ closeMsg }}</span>
    </div>

    <!-- 回合快照列表 -->
    <div class="sheet">
      <h3 class="sheet-title">已关闭回合（快照）</h3>
      <table v-if="history.length" class="sheet-table">
        <thead><tr><th>回合</th><th>关闭时间</th><th>行动记录</th></tr></thead>
        <tbody>
          <tr v-for="h in history" :key="h.id">
            <td>第 {{ h.roundNumber ?? '—' }} 回合</td>
            <td>{{ (h.closedAt || '—').replace('T', ' ').slice(0, 16) }}</td>
            <td>{{ actionCountText(h) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-tip">还没有已关闭的回合。</p>
    </div>
  </div>
</template>

<script setup>
// 轮次结算页：供给/消耗口径 + 关回合快照 + 历史列表
import { ref, computed, watch, onMounted } from 'vue'
import { useCurrentCampaign } from '../../composables/useCurrentCampaign'
import { getCurrentRound, closeCurrentRound, listRoundHistory } from '../../services/round'

const { current } = useCurrentCampaign()
const campaignId = computed(() => current.value?.id)

const round = ref(null)
const history = ref([])
const closing = ref(false)
const closeMsg = ref('')

function actionCountText(h) {
  // history 接口返回的 servantActions/masterActions 已是数组（或 null）
  const count = (v) => (Array.isArray(v) ? v.length : 0)
  const s = count(h.servantActions)
  const m = count(h.masterActions)
  return s + m ? `从者 ${s} 条 / 御主 ${m} 条` : '（无行动记录）'
}

async function refresh() {
  if (!campaignId.value) { round.value = null; history.value = []; return }
  try {
    const data = await getCurrentRound(campaignId.value)
    round.value = data?.round || null
  } catch { round.value = null }
  try { history.value = await listRoundHistory(campaignId.value) } catch { history.value = [] }
}

async function doClose() {
  closing.value = true
  closeMsg.value = ''
  try {
    await closeCurrentRound(campaignId.value)
    closeMsg.value = '已关闭并生成快照，可在历史行动页查看'
    await refresh()
  } catch (e) {
    closeMsg.value = `关闭失败：${e.message}`
  } finally {
    closing.value = false
  }
}

watch(campaignId, refresh, { immediate: true })
onMounted(refresh)
</script>

<style scoped>
.grid-two { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
@media (max-width: 760px) { .grid-two { grid-template-columns: 1fr; } }
.rule-list { margin: 0; padding-left: 1.2rem; font-size: 0.88rem; line-height: 1.9; }
</style>
