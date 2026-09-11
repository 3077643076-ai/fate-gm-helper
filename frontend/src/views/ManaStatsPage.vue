<script setup>
// 魔力统计页：每轮末对照表——上轮期末 / 行动增减 / 应然期末 / 本轮录入 / 差异
//   应然期末 = 上轮期末录入 + 行动魔力净增减（昼+夜，作废不计）
//   战斗增减未计入（战斗魔力结算接入后自动带上）；转让等手动调整看差异列人工核对
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { scrubName } from '../privacy'

const route = useRoute()
const campaigns = ref([])
const campaignId = ref(null)
const round = ref('')
const report = ref(null)
const msg = ref('')
const busy = ref(false)

async function loadCampaigns() {
  const r = await fetch('/api/campaigns')
  const body = await r.json()
  campaigns.value = body.content ?? body ?? []
  const fromUrl = Number(route.query.campaignId)
  const saved = Number(localStorage.getItem('hub-campaign-id'))
  if (campaigns.value.some(c => c.id === fromUrl)) campaignId.value = fromUrl
  else if (campaigns.value.some(c => c.id === saved)) campaignId.value = saved
  else campaignId.value = campaigns.value[0]?.id ?? null
}

async function load() {
  if (!campaignId.value) { msg.value = '先选战役'; return }
  busy.value = true
  msg.value = ''
  try {
    const qs = new URLSearchParams({ campaignId: campaignId.value })
    if (round.value !== '') qs.set('round', String(round.value))
    const r = await fetch(`/api/engine/mana/report?${qs}`)
    const body = await r.json()
    if (!r.ok) { msg.value = body.error ?? `HTTP ${r.status}`; return }
    report.value = body
  } finally {
    busy.value = false
  }
}

function fmtDelta(a) {
  const parts = []
  if (a.actionGain) parts.push(`+${a.actionGain}`)
  if (a.actionCost) parts.push(`-${a.actionCost}`)
  return parts.join(' / ') || '—'
}
function tipBreakdown(a) {
  if (!a.breakdown.length) return '本轮无行动增减'
  return '本轮行动：\n' + a.breakdown
    .map(b => `${b.phase} ${b.slot > 1 ? `第${b.slot}动 ` : ''}${b.actionKey}${b.target ? '→' + b.target : ''}  ${b.mana >= 0 ? '+' : ''}${b.mana}${b.status !== 'settled' ? '（未结算）' : ''}`)
    .join('\n')
}

onMounted(async () => {
  await loadCampaigns()
  await load()
})
</script>

<template>
  <div class="page">
    <header class="page-head">
      <h1>魔力统计</h1>
      <p class="sub">每轮末对照：上轮期末 → 行动增减 → 应然期末 vs 本轮录入，差异标红交 GM 核</p>
    </header>

    <section class="card">
      <div class="row">
        <label>战役
          <select v-model="campaignId">
            <option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.name ?? ('#' + c.id) }}</option>
          </select>
        </label>
        <label>回合
          <input v-model="round" type="number" min="1" placeholder="当前" style="width:80px" />
        </label>
        <button class="btn-primary" :disabled="busy" @click="load">统计</button>
      </div>
      <p v-if="msg" class="msg">{{ msg }}</p>
    </section>

    <template v-if="report">
      <section class="chips">
        <span class="chip">第{{ report.round }}天（对照第{{ report.prevRound }}天录入）</span>
        <span class="chip">单位 {{ report.summary.units }}</span>
        <span class="chip" :class="{ good: report.summary.withPrev === report.summary.units }">上轮已录 {{ report.summary.withPrev }}/{{ report.summary.units }}</span>
        <span class="chip" :class="{ good: report.summary.withCurr === report.summary.units }">本轮已录 {{ report.summary.withCurr }}/{{ report.summary.units }}</span>
        <span class="chip" :class="{ warn: report.summary.diffs > 0 }">差异≠0：{{ report.summary.diffs }}</span>
        <span class="chip" :class="{ warn: report.summary.unsettled > 0 }">含未结算行动：{{ report.summary.unsettled }}</span>
      </section>

      <section class="card">
        <div class="card-title">对照表 <em>战斗增减未计入（战斗魔力结算接入后自动带上）；转让等手动调整请按差异人工核对</em></div>
        <table class="tbl">
          <thead>
            <tr>
              <th>单位</th><th>角色</th><th style="width:56px">上限</th>
              <th style="width:76px">上轮期末</th><th style="width:96px">行动增减</th>
              <th style="width:76px">应然期末</th><th style="width:76px">本轮录入</th>
              <th style="width:84px">差异</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in report.rows" :key="(r.unitKey ?? '卡') + (r.cardId ?? '')">
              <td class="mono">{{ r.unitKey ?? '—' }}<span v-if="r.missing" class="badge bad">缺卡</span></td>
              <td>{{ scrubName(r.cardCode, r.unitKey) }}</td>
              <td class="dim">{{ r.manaLimit ?? '—' }}</td>
              <td>{{ r.prevMana ?? '—' }}</td>
              <td :title="tipBreakdown(r)" class="delta">{{ fmtDelta(r) }}<span v-if="r.hasUnsettled" class="badge warn">未结算</span></td>
              <td>{{ r.expected ?? '—' }}</td>
              <td>{{ r.currMana ?? '—' }}</td>
              <td>
                <span v-if="r.diff == null" class="dim">—</span>
                <span v-else-if="r.diff === 0" class="badge okb">平</span>
                <span v-else class="badge bad">{{ r.diff > 0 ? '+' : '' }}{{ r.diff }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p class="hint">行动增减悬停可看逐条明细；「未结算」= 该单位有非 settled 状态的含魔力行动，数字未定</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.page { padding: 22px 26px; overflow: auto; }
.page-head h1 { margin: 0 0 4px; font-size: 20px; color: #e9edf5; }
.sub { margin: 0 0 16px; color: #7d8392; font-size: 13px; }
.card { background: #1e2029; border: 1px solid #2c2f3a; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; }
.card-title { font-size: 14px; color: #cdd3df; margin-bottom: 12px; font-weight: 600; }
.card-title em { font-style: normal; color: #6f7686; font-size: 12px; margin-left: 6px; font-weight: 400; }
.row { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: flex-end; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #8a90a0; }
select, input {
  background: #16171d; border: 1px solid #333744; color: #d7dae2;
  border-radius: 6px; padding: 6px 8px; font-size: 13px; min-width: 110px;
}
.btn-primary {
  background: #2f5f9e; border: 1px solid #3f77bd; color: #eaf2fc;
  border-radius: 6px; padding: 7px 16px; font-size: 13px; cursor: pointer;
}
.btn-primary:disabled { opacity: 0.5; cursor: default; }
.msg { color: #d8b46a; font-size: 13px; margin: 8px 0 0; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.chip { background: #23252e; border: 1px solid #2f333f; border-radius: 14px; padding: 4px 12px; font-size: 12px; color: #b9c1d0; }
.chip.good { color: #9ecb7d; border-color: #3a4a34; }
.chip.warn { color: #e0b56a; border-color: #4a3f2a; }
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl th { text-align: left; color: #7d8392; font-weight: 500; padding: 6px 8px; border-bottom: 1px solid #2c2f3a; }
.tbl td { padding: 6px 8px; border-bottom: 1px solid #262933; }
.dim { color: #7d8392; font-size: 12px; }
.mono { font-family: Consolas, monospace; color: #a8c7ec; white-space: nowrap; }
.delta { cursor: help; }
.badge { font-size: 11px; padding: 1px 8px; border-radius: 9px; background: #2a2d38; color: #9aa1b0; white-space: nowrap; margin-left: 4px; }
.badge.bad { background: #3a2727; color: #e0a0a0; }
.badge.okb { background: #273327; color: #9ecb7d; }
.badge.warn { background: #3a3327; color: #e0b56a; }
.hint { color: #626878; font-size: 12px; margin: 10px 0 0; }
</style>
