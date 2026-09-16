<template>
  <div>
    <div class="page-head">
      <h2>行动结算 · 按结算链逐步确认</h2>
      <p>回合开始状态结算 → 按链序逐环节确认 → 清完裁决 → 推进下一时段</p>
    </div>

    <!-- 回合开始状态结算（5.2.6 状态链） -->
    <div class="sheet">
      <h3 class="sheet-title">回合开始状态结算</h3>
      <p class="sheet-note">
        中毒/灼伤/感电等按 5.2.6 状态链处理：抗性 → 特性赋予 → 封印 → 晕眩 → 恐惧 → 魅惑 → 迟滞 → 石化 → 灼伤 → 感电 → 中毒；
        层数递减、持续伤害先落账，处理完才进入下面的行动结算链。
      </p>
      <table v-if="statusEffects.length" class="sheet-table">
        <thead><tr><th>单位</th><th>效果</th><th>范围</th><th>到期</th></tr></thead>
        <tbody>
          <tr v-for="(e, i) in statusEffects" :key="i">
            <td>{{ e.owner || '—' }}</td>
            <td>{{ e.effect_name || '—' }}</td>
            <td>{{ e.scope || '—' }}</td>
            <td>{{ e.expires || '—' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-tip">当前没有挂账的生效状态效果。</p>
    </div>

    <!-- 逐步确认条 -->
    <div class="sheet">
      <h3 class="sheet-title">结算链逐步确认</h3>
      <div class="chain-bar">
        <template v-for="(step, i) in chainSteps" :key="step">
          <button
            class="chain-step"
            :class="{ done: i < confirmedStep, active: i === confirmedStep, todo: i > confirmedStep }"
            @click="confirmedStep = i"
          >{{ step }}<small>{{ i < confirmedStep ? '已确认' : (i === confirmedStep ? '处理中' : '待') }}</small></button>
          <span v-if="i < chainSteps.length - 1" class="chain-arrow">→</span>
        </template>
      </div>
      <p class="sheet-note">点环节切换当前处理对象；确认完一环点"确认本环节"锁定（只能回退最近一环）。全部确认完用顶部"下一时段"推进。</p>
      <button class="btn primary small" :disabled="confirmedStep >= chainSteps.length - 1" @click="confirmStep">
        {{ confirmedStep >= chainSteps.length - 1 ? '全部环节已确认' : `确认本环节（${chainSteps[confirmedStep]}）` }}
      </button>
    </div>

    <!-- 当前环节行动表（引擎登记的行动） -->
    <div class="sheet">
      <h3 class="sheet-title">当前环节待处理行动（{{ chainSteps[confirmedStep] }}）</h3>
      <table v-if="currentStepActions.length" class="sheet-table">
        <thead><tr><th>链序</th><th>单位</th><th>行动</th><th>目标</th><th>状态</th><th>结算备注</th></tr></thead>
        <tbody>
          <tr v-for="a in currentStepActions" :key="a.id ?? `${a.unit_key}-${a.action_key}`">
            <td>{{ chainSteps.indexOf(displayKey(a.action_key)) + 1 || '—' }}</td>
            <td>{{ a.unit_key }}</td>
            <td>{{ a.action_key }}</td>
            <td>{{ a.target || '—' }}</td>
            <td :class="{ 'cell-auto': a.status === 'settled' }">{{ a.status }}</td>
            <td>{{ a.settle_note || '—' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-tip">引擎里没有登记在「{{ chainSteps[confirmedStep] }}」环节的行动。玩家 QQ 行动经 AI 代收/标准话术登记后会出现在这里。</p>
    </div>

    <!-- 手动登记行动（补录口） -->
    <div class="sheet">
      <h3 class="sheet-title">手动登记行动（补录）</h3>
      <div class="reg-row">
        <input v-model="regUnit" class="input" placeholder="单位代号，如 泰然冢" />
        <input v-model="regText" class="input reg-text" placeholder="行动原文，如 机动-许昌" @keydown.enter="doRegister" />
        <button class="btn" :disabled="registering || !regUnit.trim() || !regText.trim()" @click="doRegister">
          {{ registering ? '登记中…' : '登记' }}
        </button>
      </div>
      <p v-if="regMsg" class="sheet-note">{{ regMsg }}</p>
    </div>

    <!-- 需裁决队列 -->
    <div class="sheet">
      <h3 class="sheet-title">需裁决队列 <span v-if="rulings.length" class="ruling-count">{{ rulings.length }} 项待处理</span></h3>
      <p class="sheet-note">清空本队列才能顺利推进时段（引擎推进有前置检查）。</p>
      <table v-if="rulings.length" class="sheet-table">
        <thead><tr><th>#</th><th>类型</th><th>内容</th><th>AI 初判</th><th>裁决</th></tr></thead>
        <tbody>
          <tr v-for="r in rulings" :key="r.id">
            <td>{{ r.id }}</td>
            <td>{{ r.kind }}</td>
            <td class="content-cell">{{ r.context }}</td>
            <td>{{ r.ai_guess || '—' }}</td>
            <td>
              <div class="ruling-row">
                <input v-model="resolutions[r.id]" class="input" placeholder="裁决结论" />
                <button class="btn small" :disabled="!resolutions[r.id]?.trim()" @click="doResolve(r.id)">定</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-tip">没有待裁决项。</p>
    </div>
  </div>
</template>

<script setup>
// 行动结算页：状态结算展示 + 结算链逐步确认 + 引擎行动表 + 手动补录 + 需裁决
import { ref, reactive, computed, watch } from 'vue'
import { useCurrentCampaign } from '../../composables/useCurrentCampaign'
import { getEngineStatus, registerEngineAction, listRulings, resolveRuling } from '../../services/engine'

const { current } = useCurrentCampaign()
const campaignId = computed(() => current.value?.id)

// 结算链类别（草图：机动→魂食→干涉→解放→制造→休整→摧毁工房）
const chainSteps = ['机动', '魂食', '干涉', '解放', '制造', '休整', '摧毁工房']
const confirmedStep = ref(0)

// 引擎数据
const engineActions = ref([])
const statusEffects = ref([])
const rulings = ref([])
const resolutions = reactive({})

// 引擎 action_key 展示名对齐（引擎用拼音键时兜底原样显示）
function displayKey(key) {
  const hit = chainSteps.find(s => key && (key.includes(s) || s.includes(key)))
  return hit || key
}

const currentStepActions = computed(() => {
  const step = chainSteps[confirmedStep.value]
  return engineActions.value.filter(a => displayKey(a.action_key) === step)
})

async function refresh() {
  if (!campaignId.value) { engineActions.value = []; statusEffects.value = []; rulings.value = []; return }
  try {
    const s = await getEngineStatus(campaignId.value)
    engineActions.value = s.actions || []
    statusEffects.value = s.activeEffects || []
  } catch {
    engineActions.value = []
    statusEffects.value = []
  }
  try {
    rulings.value = await listRulings(campaignId.value)
  } catch {
    rulings.value = []
  }
}

function confirmStep() {
  if (confirmedStep.value < chainSteps.length - 1) confirmedStep.value += 1
}

// 手动登记
const regUnit = ref('')
const regText = ref('')
const registering = ref(false)
const regMsg = ref('')

async function doRegister() {
  registering.value = true
  regMsg.value = ''
  try {
    const r = await registerEngineAction({
      campaignId: campaignId.value,
      unitKey: regUnit.value.trim(),
      text: regText.value.trim(),
    })
    const n = r?.registered?.length || 0
    const fail = r?.failures?.length || 0
    regMsg.value = `已登记 ${n} 条行动${fail ? `；${fail} 条片段解析失败进需裁决` : ''}${r?.note ? `。${r.note}` : ''}`
    regText.value = ''
    await refresh()
  } catch (e) {
    regMsg.value = `登记失败：${e.message}`
  } finally {
    registering.value = false
  }
}

async function doResolve(id) {
  try {
    await resolveRuling(id, resolutions[id].trim())
    delete resolutions[id]
    await refresh()
  } catch (e) {
    regMsg.value = `裁决失败：${e.message}`
  }
}

watch(campaignId, refresh, { immediate: true })
</script>

<style scoped>
.chain-bar { display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; margin-bottom: 0.6rem; }
.chain-step {
  border: 1px solid var(--c-line);
  background: var(--c-paper);
  border-radius: var(--radius);
  padding: 0.28rem 0.7rem;
  font-size: 0.85rem;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}
.chain-step small { font-size: 0.68rem; color: var(--c-ink-2); }
.chain-step.done { background: var(--c-ok-soft); border-color: var(--c-ok); }
.chain-step.done small { color: var(--c-ok); }
.chain-step.active { background: var(--c-primary); border-color: var(--c-primary); color: #fff; }
.chain-step.active small { color: rgba(255, 255, 255, 0.75); }
.chain-step.todo { opacity: 0.6; }
.chain-arrow { color: var(--c-ink-2); font-size: 0.8rem; }

.reg-row { display: flex; gap: 0.5rem; }
.reg-text { flex: 1; }

.ruling-count { color: var(--c-warn); font-size: 0.85rem; font-weight: 400; }
.ruling-row { display: flex; gap: 0.4rem; }
.ruling-row .input { min-width: 140px; }
.content-cell { max-width: 320px; }
</style>
