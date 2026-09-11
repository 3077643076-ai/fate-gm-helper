<script setup>
// 行动统计页：一键统计 → 规范文本 → 按结算链排序（与 settler 同一 chainRank 口径）
//   统计：/api/engine/actions/summary（可带 napcatBase 附带公告状态）
//   规范：formatActionStandard 的 standard 单行规范单，支持整单复制
//   排序：链位 rank → slot → 单位（引擎结算顺序=页面显示顺序）
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { scrub } from '../privacy'

const route = useRoute()
const campaigns = ref([])
const campaignId = ref(null)
const round = ref('')
const phase = ref('昼')
const summary = ref(null)
const napcatBase = ref('')
const msg = ref('')
const busy = ref(false)
const copied = ref(false)

const STATUS_TEXT = { declared: '已宣言', settled: '已结算', deferred: '已延期', replaced: '被替换', void: '作废' }
const statusClass = s => ({ declared: 'st-declared', settled: 'st-settled', deferred: 'st-deferred', replaced: 'st-replaced', void: 'st-void' }[s] ?? '')

const rows = computed(() => {
  // 展示序号：跨链段连续编号（每次重算从 1 起），链段首行打 chainHead 标记
  const out = []
  let no = 0
  let lastChain = null
  for (const sec of summary.value?.chainSections ?? []) {
    for (const a of sec.actions) {
      out.push({ ...a, chain: sec.chain, no: ++no, chainHead: sec.chain !== lastChain })
      lastChain = sec.chain
    }
  }
  return out
})

const plainText = computed(() =>
  rows.value.map(a => `${a.no}. ${a.standard}${a.status === 'void' ? '【作废】' : ''}`).join('\n'))

async function loadCampaigns() {
  const r = await fetch('/api/campaigns')
  const body = await r.json()
  campaigns.value = body.content ?? body ?? []
  // 优先级：URL ?campaignId=（可深链）> localStorage 记忆 > 列表第一个
  const fromUrl = Number(route.query.campaignId)
  const saved = Number(localStorage.getItem('hub-campaign-id'))
  if (campaigns.value.some(c => c.id === fromUrl)) campaignId.value = fromUrl
  else if (campaigns.value.some(c => c.id === saved)) campaignId.value = saved
  else campaignId.value = campaigns.value[0]?.id ?? null
  try {
    const c = await (await fetch('/api/engine/agent/config')).json()
    napcatBase.value = c.napcatHttpBase ?? ''
  } catch { /* 没配就不带公告状态 */ }
}

async function load(withNotices) {
  if (!campaignId.value) { msg.value = '先选战役'; return }
  busy.value = true
  msg.value = ''
  copied.value = false
  try {
    const qs = new URLSearchParams({ campaignId: campaignId.value, phase: phase.value })
    if (round.value !== '') qs.set('round', String(round.value))
    if (withNotices) {
      if (!napcatBase.value) { msg.value = '设置页还没填 NapCat HTTP 地址，本次只统计本地库'; }
      else qs.set('napcatBase', napcatBase.value)
    }
    const r = await fetch(`/api/engine/actions/summary?${qs}`)
    const body = await r.json()
    if (!r.ok) { msg.value = body.error ?? `HTTP ${r.status}`; return }
    summary.value = body
  } finally {
    busy.value = false
  }
}

async function remindMissing() {
  if (!napcatBase.value) { msg.value = '设置页还没填 NapCat HTTP 地址'; return }
  busy.value = true
  msg.value = ''
  try {
    const r = await fetch('/api/engine/notices/remind-missing', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId: campaignId.value, napcatBase: napcatBase.value }),
    })
    const body = await r.json()
    if (!r.ok) { msg.value = body.error ?? `HTTP ${r.status}`; return }
    msg.value = `催办完成：未交 ${body.missingCount} 组，发出 ${body.sent} 条${body.failed ? `，失败 ${body.failed}` : ''}`
    await load(true)
  } finally {
    busy.value = false
  }
}

async function copyAll() {
  try {
    await navigator.clipboard.writeText(plainText.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch { msg.value = '复制失败（浏览器权限）' }
}

function fmtMana(a) {
  const parts = []
  if (a.manaGain) parts.push(`+${a.manaGain}`)
  if (a.manaCost) parts.push(`-${a.manaCost}`)
  return parts.join(' / ') || '—'
}
function fmtRate(a) {
  if (a.rate == null) return '—'
  const bonus = a.phase === '昼' ? a.dayBonus : a.nightBonus
  return `${a.rate}%${bonus ? `（${a.phase}${bonus > 0 ? '+' : ''}${bonus}）` : ''}`
}

onMounted(async () => {
  await loadCampaigns()
  await load(false) // 进页即查：GM 打开就能看到当前时段的统计
})
</script>

<template>
  <div class="page">
    <header class="page-head">
      <h1>行动统计</h1>
      <p class="sub">统计提交 → 规范单 → 结算链排序（页面顺序 = 引擎结算顺序）</p>
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
        <label>时段
          <select v-model="phase"><option>昼</option><option>夜</option></select>
        </label>
        <button class="btn-primary" :disabled="busy" @click="load(false)">统计</button>
        <button class="btn-ghost" :disabled="busy" title="附带各私组公告状态" @click="load(true)">连 NapCat 统计</button>
        <button class="btn-ghost" :disabled="busy" title="给未交组发提醒公告" @click="remindMissing">催未交</button>
        <button v-if="rows.length" class="btn-ghost" @click="copyAll">{{ copied ? '已复制 ✓' : '复制规范单' }}</button>
      </div>
      <p v-if="msg" class="msg">{{ msg }}</p>
    </section>

    <template v-if="summary">
      <section class="chips">
        <span class="chip">第{{ summary.round }}天{{ summary.phase }}</span>
        <span v-if="summary.summary.groupsSubmitted != null" class="chip" :class="{ good: summary.summary.groupsMissing === 0, warn: summary.summary.groupsMissing > 0 }">
          已交 {{ summary.summary.groupsSubmitted }}/{{ summary.summary.groupsTotal }} 组
        </span>
        <span class="chip">单位 {{ summary.summary.unitsRegistered }}/{{ summary.summary.unitsExpected }}</span>
        <span class="chip">行动 {{ summary.summary.actionsActive }}<template v-if="summary.summary.actionsVoid"> · 作废 {{ summary.summary.actionsVoid }}</template></span>
        <span class="chip" :class="{ warn: summary.summary.pendingRulings > 0 }">需裁决 {{ summary.summary.pendingRulings }}</span>
        <span v-if="summary.summary.extraUnits.length" class="chip warn">编外单位：{{ summary.summary.extraUnits.join('、') }}</span>
      </section>

      <section v-if="summary.groups.length" class="card">
        <div class="card-title">私组提交 <em>需 NapCat 在线才有公告状态</em></div>
        <table class="tbl">
          <thead><tr><th>职阶</th><th>群</th><th>公告</th><th>行动数</th><th>单位</th></tr></thead>
          <tbody>
            <tr v-for="g in summary.groups" :key="g.groupId">
              <td>{{ g.class }}</td>
              <td>{{ g.groupName || g.groupId }}</td>
              <td>
                <span v-if="g.noticeError" class="badge bad">读取失败</span>
                <span v-else-if="g.confirmed" class="badge okb">已确认</span>
                <span v-else-if="g.hasNotice" class="badge mid">已交</span>
                <span v-else-if="g.hasNotice === false" class="badge bad">未交</span>
                <span v-else class="badge">—</span>
              </td>
              <td>{{ g.actionCount }}</td>
              <td>{{ g.units.join('、') || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="rows.length" class="card">
        <div class="card-title">规范单 · 结算链排序 <em>{{ rows.length }} 行</em></div>
        <table class="tbl">
          <thead><tr><th style="width:36px">#</th><th style="width:70px">单位</th><th>规范文本</th><th style="width:110px">判定</th><th style="width:90px">魔力</th><th style="width:76px">状态</th></tr></thead>
          <tbody>
            <template v-for="a in rows" :key="a.id">
              <tr v-if="a.chainHead" class="chain-row">
                <td colspan="6">── {{ a.chain }} ──</td>
              </tr>
              <tr :class="{ 'void-row': a.status === 'void' }">
                <td class="dim">{{ a.no }}</td>
                <td class="mono">{{ a.unitKey }}<span v-if="a.slot > 1" class="slot">·{{ a.slot }}动</span></td>
                <td class="std" :title="`原文：${scrub(a.rawText) || '—'}`">{{ a.standard }}</td>
                <td class="dim">{{ fmtRate(a) }}</td>
                <td class="dim">{{ fmtMana(a) }}</td>
                <td><span class="badge" :class="statusClass(a.status)">{{ STATUS_TEXT[a.status] ?? a.status }}</span></td>
              </tr>
            </template>
          </tbody>
        </table>
      </section>
      <p v-else class="hint">该时段还没有已登记行动</p>
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
.btn-ghost {
  background: transparent; border: 1px solid #3a3f4d; color: #aeb5c4;
  border-radius: 6px; padding: 6px 12px; font-size: 12px; cursor: pointer;
}
.btn-ghost:hover:not(:disabled) { border-color: #5a9bd8; color: #e9edf5; }
.msg { color: #d8b46a; font-size: 13px; margin: 8px 0 0; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.chip { background: #23252e; border: 1px solid #2f333f; border-radius: 14px; padding: 4px 12px; font-size: 12px; color: #b9c1d0; }
.chip.good { color: #9ecb7d; border-color: #3a4a34; }
.chip.warn { color: #e0b56a; border-color: #4a3f2a; }
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl th { text-align: left; color: #7d8392; font-weight: 500; padding: 6px 8px; border-bottom: 1px solid #2c2f3a; }
.tbl td { padding: 6px 8px; border-bottom: 1px solid #262933; vertical-align: top; }
.chain-row td {
  color: #5a9bd8; font-size: 12px; letter-spacing: 2px;
  background: #1a1d26; padding-top: 10px; border-bottom: none;
}
.std { color: #d9dde6; }
.dim { color: #7d8392; font-size: 12px; }
.mono { font-family: Consolas, monospace; color: #a8c7ec; white-space: nowrap; }
.slot { color: #d8b46a; font-size: 11px; margin-left: 2px; }
.void-row .std { text-decoration: line-through; color: #6a6f7d; }
.badge { font-size: 11px; padding: 1px 8px; border-radius: 9px; background: #2a2d38; color: #9aa1b0; white-space: nowrap; }
.badge.mid { background: #2a3140; color: #9fb6d8; }
.badge.bad { background: #3a2727; color: #e0a0a0; }
.badge.okb { background: #273327; color: #9ecb7d; }
.st-declared { background: #2a3140; color: #9fb6d8; }
.st-settled { background: #273327; color: #9ecb7d; }
.st-deferred { background: #3a3327; color: #e0b56a; }
.st-replaced { background: #33273a; color: #c39ad8; }
.st-void { background: #2c2c33; color: #8a8f9c; }
.hint { color: #626878; font-size: 12px; }
</style>
