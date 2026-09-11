<script setup>
// 战斗页：按战役创建/查看引擎战斗，打开独立战斗表推进状态机
//   创建 POST /api/engine/battles（双方主力位必填，辅助位可选）
//   列表 GET /api/engine/battles?campaignId=（新→旧 50 场）
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const campaigns = ref([])
const campaignId = ref(null)
const units = ref([])
const battles = ref([])
const msg = ref('')
const busy = ref(false)

const form = ref({ round: '', phase: '昼', leyline: '', width: 3, blueMain: '', blueAssist: '', yellowMain: '', yellowAssist: '' })

const STAGE_TEXT = { formation: '编队', initial: '初始工序', main: '主要工序', final: '最终工序', done: '已结算' }
const stageClass = s => ({ formation: 'st-formation', initial: 'st-initial', main: 'st-main', final: 'st-final', done: 'st-done' }[s] ?? '')

async function loadCampaigns() {
  const r = await fetch('/api/campaigns')
  const body = await r.json()
  campaigns.value = body.content ?? body ?? []
  const saved = localStorage.getItem('hub-campaign-id')
  campaignId.value = campaigns.value.some(c => c.id === Number(saved))
    ? Number(saved)
    : campaigns.value[0]?.id ?? null
}

async function loadUnits() {
  const r = await fetch('/api/engine/units')
  const body = await r.json()
  units.value = body.units ?? []
}

async function loadBattles() {
  if (!campaignId.value) { battles.value = []; return }
  const r = await fetch(`/api/engine/battles?campaignId=${campaignId.value}`)
  const body = await r.json()
  battles.value = body.battles ?? []
}

function currentRoundFallback() {
  // 帮 GM 省一次切换：战役名里没有回合信息，留空由引擎取当前回合
  form.value.round = form.value.round === '' ? '' : form.value.round
}

async function createBattle() {
  if (!campaignId.value) { msg.value = '先选战役'; return }
  if (!form.value.blueMain || !form.value.yellowMain) { msg.value = '双方主力位都要选'; return }
  busy.value = true
  msg.value = ''
  try {
    const body = {
      campaignId: campaignId.value,
      round: form.value.round === '' ? undefined : Number(form.value.round),
      phase: form.value.phase,
      leyline: form.value.leyline,
      width: Number(form.value.width) || 3,
      attacker: 'blue',
      blue: { main: form.value.blueMain, assists: form.value.blueAssist ? [form.value.blueAssist] : [] },
      yellow: { main: form.value.yellowMain, assists: form.value.yellowAssist ? [form.value.yellowAssist] : [] },
    }
    const r = await fetch('/api/engine/battles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const res = await r.json()
    if (!r.ok) { msg.value = res.error ?? `HTTP ${r.status}`; return }
    msg.value = ''
    localStorage.setItem('engine-battle-id', res.battleId)
    await loadBattles()
    router.push(`/engine-battle/${res.battleId}`)
  } finally {
    busy.value = false
  }
}

function fmtRate(wr) {
  if (!wr) return '—'
  try {
    const o = typeof wr === 'string' ? JSON.parse(wr) : wr
    if (o.final != null) return `蓝 ${Math.round(o.final * 100)}%`
    if (o.base != null) return `基础 ${Math.round(o.base * 100)}%`
  } catch { /* 旧格式忽略 */ }
  return '—'
}

onMounted(async () => {
  await Promise.all([loadCampaigns(), loadUnits()])
  await loadBattles()
})
watch(campaignId, (v) => { localStorage.setItem('hub-campaign-id', v ?? ''); loadBattles() })
</script>

<template>
  <div class="page">
    <header class="page-head">
      <h1>战斗</h1>
      <p class="sub">选双方参战位创建战斗，进入战斗表推进工序；已结算战斗可复盘</p>
    </header>

    <section class="card">
      <div class="card-title">创建战斗</div>
      <div class="row">
        <label>战役
          <select v-model="campaignId">
            <option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.name ?? ('#' + c.id) }}</option>
          </select>
        </label>
        <label>回合
          <input v-model="form.round" type="number" min="1" placeholder="留空=当前回合" />
        </label>
        <label>时段
          <select v-model="form.phase"><option>昼</option><option>夜</option></select>
        </label>
        <label>灵脉
          <input v-model="form.leyline" placeholder="如 灵脉-A" />
        </label>
        <label>战场宽
          <input v-model.number="form.width" type="number" min="1" max="9" />
        </label>
      </div>
      <div class="row">
        <label>蓝方主力
          <select v-model="form.blueMain">
            <option value="" disabled>选单位</option>
            <option v-for="u in units" :key="u.unit_key" :value="u.unit_key">{{ u.unit_key }}（{{ u.card_code ?? u.code ?? '?' }}）</option>
          </select>
        </label>
        <label>蓝方辅助
          <select v-model="form.blueAssist">
            <option value="">无</option>
            <option v-for="u in units" :key="u.unit_key" :value="u.unit_key">{{ u.unit_key }}（{{ u.card_code ?? u.code ?? '?' }}）</option>
          </select>
        </label>
        <label>黄方主力
          <select v-model="form.yellowMain">
            <option value="" disabled>选单位</option>
            <option v-for="u in units" :key="u.unit_key" :value="u.unit_key">{{ u.unit_key }}（{{ u.card_code ?? u.code ?? '?' }}）</option>
          </select>
        </label>
        <label>黄方辅助
          <select v-model="form.yellowAssist">
            <option value="">无</option>
            <option v-for="u in units" :key="u.unit_key" :value="u.unit_key">{{ u.unit_key }}（{{ u.card_code ?? u.code ?? '?' }}）</option>
          </select>
        </label>
        <button class="btn-primary" :disabled="busy" @click="createBattle">创建并进入</button>
      </div>
      <p v-if="msg" class="msg">{{ msg }}</p>
      <p class="hint">单位来自「设置 → 单位注册表」；缺卡单位先去角色卡上传补卡</p>
    </section>

    <section class="card">
      <div class="card-title">战斗记录 <em v-if="battles.length">{{ battles.length }} 场</em></div>
      <table v-if="battles.length" class="tbl">
        <thead><tr><th>#</th><th>回合</th><th>灵脉</th><th>状态</th><th>胜率</th><th>结果</th><th></th></tr></thead>
        <tbody>
          <tr v-for="b in battles" :key="b.id">
            <td>{{ b.id }}</td>
            <td>第{{ b.round }}天{{ b.phase }}</td>
            <td>{{ b.leyline || '—' }}</td>
            <td><span class="stage" :class="stageClass(b.status)">{{ STAGE_TEXT[b.status] ?? b.status }}</span></td>
            <td>{{ fmtRate(b.win_rate) }}</td>
            <td>{{ b.result || '—' }}</td>
            <td><button class="btn-ghost" @click="router.push(`/engine-battle/${b.id}`)">打开</button></td>
          </tr>
        </tbody>
      </table>
      <p v-else class="hint">该战役还没有战斗记录</p>
    </section>
  </div>
</template>

<style scoped>
.page { padding: 22px 26px; overflow: auto; }
.page-head h1 { margin: 0 0 4px; font-size: 20px; color: #e9edf5; }
.sub { margin: 0 0 16px; color: #7d8392; font-size: 13px; }
.card { background: #1e2029; border: 1px solid #2c2f3a; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; }
.card-title { font-size: 14px; color: #cdd3df; margin-bottom: 12px; font-weight: 600; }
.card-title em { font-style: normal; color: #6f7686; font-size: 12px; margin-left: 6px; }
.row { display: flex; flex-wrap: wrap; gap: 10px 14px; margin-bottom: 10px; align-items: flex-end; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #8a90a0; }
select, input {
  background: #16171d; border: 1px solid #333744; color: #d7dae2;
  border-radius: 6px; padding: 6px 8px; font-size: 13px; min-width: 110px;
}
input[type='number'] { min-width: 80px; }
.btn-primary {
  background: #2f5f9e; border: 1px solid #3f77bd; color: #eaf2fc;
  border-radius: 6px; padding: 7px 16px; font-size: 13px; cursor: pointer;
}
.btn-primary:disabled { opacity: 0.5; cursor: default; }
.btn-primary:hover:not(:disabled) { background: #386db3; }
.btn-ghost {
  background: transparent; border: 1px solid #3a3f4d; color: #aeb5c4;
  border-radius: 6px; padding: 4px 12px; font-size: 12px; cursor: pointer;
}
.btn-ghost:hover { border-color: #5a9bd8; color: #e9edf5; }
.msg { color: #e08a8a; font-size: 13px; margin: 6px 0 0; }
.hint { color: #626878; font-size: 12px; margin: 8px 0 0; }
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl th { text-align: left; color: #7d8392; font-weight: 500; padding: 6px 8px; border-bottom: 1px solid #2c2f3a; }
.tbl td { padding: 7px 8px; border-bottom: 1px solid #262933; }
.stage { font-size: 12px; padding: 2px 8px; border-radius: 10px; }
.st-formation { background: #2a3140; color: #9fb6d8; }
.st-initial, .st-main, .st-final { background: #33402c; color: #b4d39a; }
.st-done { background: #2c2c33; color: #8a8f9c; }
</style>
