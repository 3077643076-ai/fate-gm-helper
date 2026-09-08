<script setup>
// 辅助：阶段中文标签与单位显示
function battleStageLabel(s) {
  return ({ formation: '战斗开始时', initial: '初始工序', main: '主要工序', final: '最终工序', done: '已结束' })[s] ?? s
}
function unitLabel(formationJson, slot) {
  try {
    const f = JSON.parse(formationJson ?? '{}')
    if (slot === 'main') return f.main ?? '—'
    if (slot === 'assist0') return (f.assists ?? [])[0] ?? '—'
  } catch {}
  return '—'
}

// 引擎战斗表：复刻 Excel 战斗表结构的交互页面（其他 GM 零适应）
// 数据源：/api/engine/battles/*（战斗状态机）
// 流程：建立 → 战斗开始时（战术）→ 初始工序（属性）→ 主要工序（修正）→ 最终工序（死斗/决胜）→ 清算
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const battleId = ref(Number(route.params.battleId) || Number(localStorage.getItem('engine-battle-id')) || null)
const battle = ref(null)
const err = ref('')
const loading = ref(false)

// 新建表单
const newForm = ref({
  campaignId: Number(localStorage.getItem('engine-campaign-id')) || 999002,
  round: 1, phase: '昼', leyline: '', width: 5, attacker: 'blue',
  blueMain: '枪从', blueAssist: '枪御', yellowMain: '术从', yellowAssist: '术御',
})

// 操作表单
const tacticForm = ref({ blue: '', yellow: '' })
const attrForm = ref({ blue: 'strength', yellow: 'mana', random: '' })
const corrForm = ref({ stage: 'main', side: 'blue', value: 10, note: '' })
const finalForm = ref({ blueDeath: false, yellowDeath: false, roll: '' })

const ATTRS = [
  { v: 'strength', l: '筋力' }, { v: 'endurance', l: '耐久' }, { v: 'agility', l: '敏捷' },
  { v: 'mana', l: '魔力' }, { v: 'luck', l: '幸运' }, { v: 'noblePhantasm', l: '宝具' },
]
const TACTICS = ['强击', '破袭', '试探', '扼守']
const STAT_LABEL = { level: '等级', strength: '筋力', endurance: '耐久', agility: '敏捷', mana: '魔力', luck: '幸运', noblePhantasm: '宝具' }

const battleUrl = (p) => `/api/engine/battles${p}`
async function apiPost(path, body) {
  const r = await fetch(battleUrl(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const b = await r.json().catch(() => ({}))
  if (!r.ok) { err.value = b.error ?? `HTTP ${r.status}`; return null }
  err.value = ''
  return b
}
async function load() {
  if (!battleId.value) { battle.value = null; return }
  loading.value = true
  try {
    const r = await fetch(battleUrl(`/${battleId.value}`))
    if (!r.ok) { battle.value = null; err.value = '战斗不存在'; return }
    battle.value = await r.json()
    if (battle.value.blue_tactic) tacticForm.value.blue = battle.value.blue_tactic
    if (battle.value.yellow_tactic) tacticForm.value.yellow = battle.value.yellow_tactic
    if (battle.value.blue_main_attr) attrForm.value.blue = battle.value.blue_main_attr
    if (battle.value.yellow_main_attr) attrForm.value.yellow = battle.value.yellow_main_attr
    localStorage.setItem('engine-battle-id', battleId.value)
  } finally { loading.value = false }
}

async function createBattle() {
  const f = newForm.value
  const r = await fetch(battleUrl(''), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    campaignId: f.campaignId, round: f.round, phase: f.phase, leyline: f.leyline, width: Number(f.width), attacker: f.attacker,
    blue: { main: f.blueMain, assists: f.blueAssist ? [f.blueAssist] : [] },
    yellow: { main: f.yellowMain, assists: f.yellowAssist ? [f.yellowAssist] : [] },
  }) })
  const b = await r.json()
  if (!r.ok) { err.value = b.error ?? '创建失败'; return }
  battleId.value = b.battleId
  await load()
}
async function submitTactics() {
  const r = await apiPost(`/${battleId.value}/tactics`, { blue: tacticForm.value.blue || null, yellow: tacticForm.value.yellow || null })
  if (r) await load()
}
async function submitAttrs() {
  const r = await apiPost(`/${battleId.value}/attrs`, { blue: attrForm.value.blue, yellow: attrForm.value.yellow, random: attrForm.value.random || undefined })
  if (r) { attrForm.value.random = r.randomAttr ?? attrForm.value.random; await load() }
}
async function addCorrection() {
  const r = await apiPost(`/${battleId.value}/correction`, { stage: corrForm.value.stage, side: corrForm.value.side, value: Number(corrForm.value.value), note: corrForm.value.note })
  if (r) { corrForm.value.note = ''; await load() }
}
async function doFinalize() {
  const body = { blueDeath: finalForm.value.blueDeath, yellowDeath: finalForm.value.yellowDeath }
  if (finalForm.value.roll !== '') body.roll = Number(finalForm.value.roll)
  const r = await apiPost(`/${battleId.value}/finalize`, body)
  if (r) await load()
}

// ---------- 派生数据 ----------
const fmt = j => { try { return JSON.parse(j ?? null) ?? null } catch { return null } }
const blueStats = computed(() => fmt(battle.value?.blue_stats))
const yellowStats = computed(() => fmt(battle.value?.yellow_stats))
const corrections = computed(() => fmt(battle.value?.corrections) ?? {})
const winRate = computed(() => fmt(battle.value?.win_rate))
const result = computed(() => fmt(battle.value?.result))
const tacticResult = computed(() => fmt(battle.value?.tactic_result) ?? {})

const STAT_ROWS = ['level', 'strength', 'endurance', 'agility', 'mana', 'luck', 'noblePhantasm']
const corrRows = computed(() => {
  const rows = []
  for (const side of ['blue', 'yellow']) {
    const c = corrections.value[side] ?? {}
    for (const [stage, value] of Object.entries(c)) {
      if (!value) continue
      const stageName = { pre: '战前', statBonus: '属性补正', initial: '初始工序', main: '主要工序', final: '最终工序' }[stage] ?? stage
      rows.push({ side: side === 'blue' ? '蓝' : '黄', stage: stageName, value, stageKey: stage })
    }
  }
  return rows
})

onMounted(load)
</script>

<template>
  <div class="ebs">
    <!-- ===== 头部 ===== -->
    <header class="ebs-head">
      <h1>战斗表</h1>
      <div v-if="battle" class="ebs-info">
        <span>{{ battle.leyline || '未填地点' }} · 宽度 {{ battle.width }}</span>
        <span>第 {{ battle.round ?? '?' }} 天 {{ battle.phase }}</span>
        <span class="ebs-stage">{{ battleStageLabel(battle.status) }}</span>
        <span v-if="result" class="ebs-winner">🏆 {{ result.winner === 'blue' ? '蓝方胜' : '黄方胜' }}（D100={{ result.roll }} vs {{ result.rate }}%）</span>
      </div>
      <div class="ebs-actions">
        <button class="btn" @click="load">刷新</button>
        <button class="btn btn-ghost" @click="router.push('/engine')">← 引擎控制台</button>
      </div>
    </header>

    <p v-if="err" class="ebs-err">{{ err }}</p>

    <!-- ===== 新建战斗 ===== -->
    <section v-if="!battle" class="ebs-new">
      <h2>建立新战斗</h2>
      <div class="grid">
        <label>地点 <input v-model="newForm.leyline" placeholder="灵脉名" /></label>
        <label>回合 <input type="number" v-model.number="newForm.round" min="1" /></label>
        <label>时段 <select v-model="newForm.phase"><option>昼</option><option>夜</option></select></label>
        <label>宽度 <input type="number" v-model.number="newForm.width" min="1" max="7" /></label>
        <label>袭击方 <select v-model="newForm.attacker"><option value="blue">蓝方</option><option value="yellow">黄方</option></select></label>
      </div>
      <h3>蓝方（袭击方默认）</h3>
      <div class="grid">
        <label>主力位 <select v-model="newForm.blueMain"><option v-for="u in ['弓从','弓御','杀从','杀御','骑从','骑御','枪从','枪御','剑从','剑御','术从','术御','狂从','狂御']" :key="u" :value="u">{{ u }}</option></select></label>
        <label>辅助位 <select v-model="newForm.blueAssist"><option value="">（无）</option><option v-for="u in ['弓从','弓御','杀从','杀御','骑从','骑御','枪从','枪御','剑从','剑御','术从','术御','狂从','狂御']" :key="u" :value="u">{{ u }}</option></select></label>
      </div>
      <h3>黄方（防守方）</h3>
      <div class="grid">
        <label>主力位 <select v-model="newForm.yellowMain"><option v-for="u in ['弓从','弓御','杀从','杀御','骑从','骑御','枪从','枪御','剑从','剑御','术从','术御','狂从','狂御']" :key="u" :value="u">{{ u }}</option></select></label>
        <label>辅助位 <select v-model="newForm.yellowAssist"><option value="">（无）</option><option v-for="u in ['弓从','弓御','杀从','杀御','骑从','骑御','枪从','枪御','剑从','剑御','术从','术御','狂从','狂御']" :key="u" :value="u">{{ u }}</option></select></label>
      </div>
      <button class="btn btn-primary" @click="createBattle">建立战斗（生成计算表）</button>
    </section>

    <!-- ===== 战斗表主体 ===== -->
    <template v-if="battle">
      <!-- 属性对比表 -->
      <section class="ebs-table-wrap">
        <h2>一、战斗计算表</h2>
        <table class="sheet">
          <thead>
            <tr><th class="rowhead"></th><th>蓝方（袭击方）</th><th>黄方（防守方）</th></tr>
          </thead>
          <tbody>
            <tr><td class="rowhead">主力位</td><td>{{ unitLabel(battle.blue_formation, 'main') }}</td><td>{{ unitLabel(battle.yellow_formation, 'main') }}</td></tr>
            <tr><td class="rowhead">辅助位</td><td>{{ unitLabel(battle.blue_formation, 'assist0') }}</td><td>{{ unitLabel(battle.yellow_formation, 'assist0') }}</td></tr>
            <tr v-for="s in STAT_ROWS" :key="s">
              <td class="rowhead">{{ STAT_LABEL[s] }}</td>
              <td :class="{ hi: (blueStats?.totals?.[s] ?? 0) > (yellowStats?.totals?.[s] ?? 0) }">{{ blueStats?.totals?.[s] ?? '—' }}</td>
              <td :class="{ hi: (yellowStats?.totals?.[s] ?? 0) > (blueStats?.totals?.[s] ?? 0) }">{{ yellowStats?.totals?.[s] ?? '—' }}</td>
            </tr>
            <tr class="tactic-row">
              <td class="rowhead">战术</td>
              <td>
                <select v-if="battle.status === 'formation'" v-model="tacticForm.blue"><option value="">（未选）</option><option v-for="t in TACTICS" :key="t" :value="t">{{ t }}</option></select>
                <template v-else>{{ battle.blue_tactic || '（未选）' }}<span v-if="tacticResult.blueInvalid" class="muted">（无效）</span></template>
              </td>
              <td>
                <select v-if="battle.status === 'formation'" v-model="tacticForm.yellow"><option value="">（未选）</option><option v-for="t in TACTICS" :key="t" :value="t">{{ t }}</option></select>
                <template v-else>{{ battle.yellow_tactic || '（未选）' }}<span v-if="tacticResult.yellowInvalid" class="muted">（无效）</span></template>
              </td>
            </tr>
          </tbody>
        </table>
        <button v-if="battle.status === 'formation'" class="btn btn-primary" @click="submitTactics">结算战术（进入初始工序）</button>
      </section>

      <!-- 属性对抗表 -->
      <section class="ebs-table-wrap" v-if="battle.status !== 'formation'">
        <h2>二、属性对抗（初始工序：双方主力位选主要属性，引擎骰随机属性）</h2>
        <div v-if="battle.status === 'initial'" class="op-row">
          <label>蓝主要 <select v-model="attrForm.blue"><option v-for="a in ATTRS" :key="a.v" :value="a.v">{{ a.l }}</option></select></label>
          <label>黄主要 <select v-model="attrForm.yellow"><option v-for="a in ATTRS" :key="a.v" :value="a.v">{{ a.l }}</option></select></label>
          <button class="btn btn-primary" @click="submitAttrs">确定属性（骰随机+出基础胜率）</button>
        </div>
        <table class="sheet" v-if="winRate">
          <thead><tr><th>对抗位</th><th>蓝</th><th>黄</th><th>结果</th><th>计分</th></tr></thead>
          <tbody>
            <tr v-for="c in winRate.comparisons" :key="c.label">
              <td>{{ c.label }}</td><td>{{ c.a }}</td><td>{{ c.b }}</td>
              <td>{{ c.score === 3 ? '优' : c.score === 2 ? '平' : '劣' }}</td>
              <td>{{ c.score }}</td>
            </tr>
            <tr class="sum"><td>合计 → 基础胜率</td><td colspan="2">{{ winRate.score }} 分</td><td colspan="2">{{ winRate.baseRate }}%</td></tr>
          </tbody>
        </table>
      </section>

      <!-- 胜率链表 -->
      <section class="ebs-table-wrap" v-if="winRate">
        <h2>三、胜率链</h2>
        <table class="sheet">
          <thead><tr><th>项目</th><th>蓝方</th><th>黄方</th></tr></thead>
          <tbody>
            <tr><td>基础胜率（属性对抗）</td><td>{{ winRate.baseRate }}%</td><td>{{ winRate.baseRate }}%</td></tr>
            <tr><td>等级差（主力位）</td><td>{{ winRate.levelDiff > 0 ? '+' + winRate.levelDiff : winRate.levelDiff }}</td><td>{{ winRate.levelDiff < 0 ? '+' + (-winRate.levelDiff) : -winRate.levelDiff }}</td></tr>
            <tr><td>属性补正（技能/战术，每点=1）</td><td>{{ winRate.statDiff >= 0 ? '+' + winRate.statDiff : winRate.statDiff }}（蓝侧）</td><td>—</td></tr>
            <tr><td>工序/战前胜率修正</td><td>见修正记录</td><td>见修正记录</td></tr>
            <tr class="sum"><td>双方累计</td><td>{{ winRate.blueRaw }}</td><td>{{ winRate.yellowRaw }}</td></tr>
            <tr class="sum"><td>实际胜率（抵消+保底{{ winRate.clampedByFloor ? '⚠触发' : '' }}）</td><td colspan="2">{{ winRate.actualBeforeClamp }}% → <b>{{ winRate.actual }}%</b></td></tr>
          </tbody>
        </table>
      </section>

      <!-- 工序修正与能力发动 -->
      <section class="ebs-table-wrap" v-if="['initial','main','final'].includes(battle.status)">
        <h2>四、能力发动申报（藏拙=不申报不计入）</h2>
        <div class="op-row">
          <label>阶段
            <select v-model="corrForm.stage">
              <option value="statBonus">属性补正（每点=1）</option>
              <option value="initial">初始工序</option>
              <option value="main">主要工序</option>
              <option value="final">最终工序</option>
              <option value="pre">战前</option>
            </select>
          </label>
          <label>方向 <select v-model="corrForm.side"><option value="blue">蓝</option><option value="yellow">黄</option></select></label>
          <label>数值 <input type="number" v-model.number="corrForm.value" /></label>
          <input v-model="corrForm.note" placeholder="备注（技能/宝具名）" />
          <button class="btn" @click="addCorrection">申报</button>
        </div>
        <table class="sheet" v-if="corrRows.length">
          <thead><tr><th>方向</th><th>阶段</th><th>数值</th></tr></thead>
          <tbody><tr v-for="(r, i) in corrRows" :key="i"><td>{{ r.side }}</td><td>{{ r.stage }}</td><td>{{ r.value > 0 ? '+' : '' }}{{ r.value }}</td></tr></tbody>
        </table>
      </section>

      <!-- 决胜 -->
      <section class="ebs-table-wrap" v-if="battle.status === 'main'">
        <h2>五、最终工序：死斗与决胜检定</h2>
        <div class="op-row">
          <label><input type="checkbox" v-model="finalForm.blueDeath" /> 蓝方死斗（+20，不可撤退）</label>
          <label><input type="checkbox" v-model="finalForm.yellowDeath" /> 黄方死斗（+20，不可撤退）</label>
          <input v-model="finalForm.roll" placeholder="决胜 D100（留空=引擎掷）" />
          <button class="btn btn-primary" @click="doFinalize">决胜检定（含等级魔耗清算）</button>
        </div>
      </section>
    </template>
  </div>
</template>


<style scoped>
.ebs { min-height: 100vh; background: #121317; color: #e8e6e3; font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; font-size: 14px; padding-bottom: 40px; }
.ebs-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; background: #1b1d24; border-bottom: 2px solid #ff8a2a; }
.ebs-head h1 { font-size: 18px; margin: 0; letter-spacing: .06em; }
.ebs-info { display: flex; gap: 14px; font-size: 13px; color: #9a9db0; }
.ebs-stage { color: #ff8a2a; font-weight: 700; }
.ebs-winner { color: #5dd39e; font-weight: 700; }
.ebs-actions { display: flex; gap: 8px; }
.ebs-err { color: #ff5c5c; padding: 8px 18px; }

.ebs-new, .ebs-table-wrap { margin: 14px 18px; background: #1b1d24; padding: 12px 16px; border: 1px solid #34374a; }
.ebs h2 { font-size: 13px; color: #9a9db0; border-left: 3px solid #ff8a2a; padding-left: 8px; margin: 4px 0 10px; }
.ebs h3 { font-size: 13px; color: #c8cbd8; margin: 10px 0 6px; }

.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; margin-bottom: 10px; }
.grid label, .op-row label { font-size: 12px; color: #9a9db0; display: flex; flex-direction: column; gap: 4px; }
.grid input, .grid select, .op-row input, .op-row select {
  background: #121317; color: #e8e6e3; border: 1px solid #34374a; padding: 6px 8px; font-size: 13px;
}
.op-row { display: flex; align-items: end; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.op-row input { min-width: 160px; }

.btn {
  background: #23262f; color: #e8e6e3; border: 1px solid #4a4e63;
  padding: 7px 16px; cursor: pointer; font-size: 13px; letter-spacing: .06em;
  clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px);
}
.btn:hover { border-color: #ff8a2a; color: #ff8a2a; }
.btn-primary { background: #ff8a2a; color: #16171c; border-color: #ff8a2a; font-weight: 700; }
.btn-primary:hover { background: #ffa04d; color: #16171c; }
.btn-ghost { border-style: dashed; }

/* 表格（Excel 观感：网格线+行头列） */
.sheet { width: 100%; border-collapse: collapse; font-size: 13px; }
.sheet th, .sheet td { border: 1px solid #34374a; padding: 6px 10px; text-align: center; }
.sheet th { background: #23262f; color: #9a9db0; font-weight: 600; }
.sheet .rowhead { background: #23262f; color: #c8cbd8; text-align: left; width: 180px; font-weight: 600; }
.sheet .hi { color: #ff8a2a; font-weight: 700; }
.sheet .sum { background: #23262f; font-weight: 700; }
.sheet .muted { color: #565a6e; margin-left: 6px; font-size: 12px; }
.sheet select { background: #121317; color: #e8e6e3; border: 1px solid #34374a; padding: 4px 6px; }
.tactic-row td { background: #1f222b; }
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-thumb { background: #34374a; }
</style>
