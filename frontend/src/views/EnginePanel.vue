<script setup>
// 引擎控制台（MAA 风格深色作战面板）
// 数据源：/api/engine/*（状态/登记/推进/裁决/判定单）
import { ref, computed, onMounted, nextTick } from 'vue'

// ---------- 状态 ----------
// 引擎是多战役通用：战役从下拉选择（localStorage 记住），不写死任何杯
const campaigns = ref([])         // 全部战役列表
const campaignId = ref(Number(localStorage.getItem('engine-campaign-id')) || null)
const campaignName = computed(() =>
  campaigns.value.find(c => c.id === campaignId.value)?.name ?? '未选择战役'
)
const round = ref(1)
const phase = ref('昼')
const status = ref(null)          // /status 返回的整体状态
const ready = ref(false)          // 引擎就绪（无未挂点判定单+无 open 裁决）
const loading = ref(false)
const logLines = ref([])          // 引擎日志（滚动输出）
const logBox = ref(null)
const todos = ref([])             // GM 待办
const totals = ref([])            // 魔力对账合计

// 行动登记表单
const formUnit = ref('弓从')
const formText = ref('')
const unitOptions = ['弓从','弓御','杀从','杀御','骑从','骑御','枪从','枪御','剑从','剑御','术从','术御','狂从','狂御']
const rulingInput = ref({})       // {id: 裁决文本}
const ticketForm = ref({ role: '', actionName: '', target: 50 })

// 结算链（分组展示用）
const CHAIN = ['机动', '魂食', '干涉', '解放', '制造', '信息', '休整', '摧毁工房', '灵脉行动', '（特殊时机）', '（跟随目标）']

// ---------- 日志 ----------
function log(text, kind = 'info') {
  const ts = new Date().toTimeString().slice(0, 8)
  logLines.value.push({ ts, text, kind })
  nextTick(() => { if (logBox.value) logBox.value.scrollTop = logBox.value.scrollHeight })
}

// ---------- 数据加载 ----------
async function loadCampaigns() {
  const r = await fetch('/api/campaigns')
  const body = await r.json()
  campaigns.value = body.content ?? body ?? []
  // localStorage 里记住的战役若已不存在则回退到第一个
  if (!campaigns.value.some(c => c.id === campaignId.value)) {
    campaignId.value = campaigns.value[0]?.id ?? null
  }
  localStorage.setItem('engine-campaign-id', campaignId.value ?? '')
}

function onCampaignChange() {
  localStorage.setItem('engine-campaign-id', campaignId.value ?? '')
  loadStatus()
}

async function loadStatus() {
  if (!campaignId.value) return
  loading.value = true
  try {
    const r = await fetch(`/api/engine/status?campaignId=${campaignId.value}&round=${round.value}&phase=${phase.value}`)
    status.value = await r.json()
    ready.value = (status.value.pendingRulings?.length ?? 0) === 0
      && (status.value.openTickets?.length ?? 0) === 0
    log(`状态刷新：${status.value.actions?.length ?? 0} 条行动 / ${status.value.pendingRulings?.length ?? 0} 条需裁决 / ${status.value.openTickets?.length ?? 0} 张未挂判定单`)
  } catch (e) {
    log('状态刷新失败：' + e.message, 'error')
  } finally {
    loading.value = false
  }
}

// ---------- 行动登记 ----------
async function registerAction() {
  if (!formText.value.trim()) return
  if (!campaignId.value) { log('请先选择战役', 'warn'); return }
  loading.value = true
  try {
    const r = await fetch('/api/engine/actions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId: campaignId.value, round: round.value, phase: phase.value, unitKey: formUnit.value, text: formText.value }),
    })
    const body = await r.json()
    if (r.status === 422) {
      log(`需裁决 #${body.pendingRulingId}：${unitLabel(formUnit.value)}「${formText.value}」— ${body.error}`, 'warn')
    } else if (r.status === 409) {
      log(`登记冲突：${body.error}`, 'error')
    } else if (body.ok) {
      log(`登记成功：${unitLabel(formUnit.value)} → ${body.actionKey}${body.target ? ' → ' + body.target : ''}`, 'ok')
    }
    formText.value = ''
    await loadStatus()
  } finally { loading.value = false }
}

async function removeAction(a) {
  // M1：登记错误用"裁决关闭"思路，行动本身标记 void（引擎结算时跳过）
  await fetch(`/api/engine/actions/${a.id}`, { method: 'DELETE' })
  log(`已移除行动：${unitLabelOf(a.unit_key)} · ${a.action_key}`, 'warn')
  await loadStatus()
}

// ---------- 推进 ----------
async function advance() {
  if (!campaignId.value) { log('请先选择战役', 'warn'); return }
  loading.value = true
  try {
    const r = await fetch('/api/engine/advance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId: campaignId.value, round: round.value, phase: phase.value }),
    })
    const body = await r.json()
    if (!r.ok) {
      log(`推进被拦（HTTP ${r.status}）：${(body.blockers ?? []).join('；')}`, 'error')
    } else {
      log(`—— 推进 ${round.value} ${phase.value} 开始 ——`, 'head')
      for (const l of body.report ?? []) log(l)
      for (const t of body.todos ?? []) { log('[GM待办] ' + t, 'warn'); todos.value.push(t) }
      for (const e of body.errors ?? []) log('[错误] ' + e, 'error')
      totals.value = body.totals ?? []
      log(`—— 推进完成，对账：${totals.value.map(t => `${t.role} ${t.total > 0 ? '+' : ''}${t.total}`).join(' / ') || '无变动'} ——`, 'head')
    }
    await loadStatus()
  } finally { loading.value = false }
}

// ---------- 需裁决 ----------
async function resolveRuling(r) {
  const resolution = (rulingInput.value[r.id] ?? '').trim()
  if (!resolution) { log('裁决需要填写处置内容', 'warn'); return }
  await fetch('/api/engine/rulings/resolve', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: r.id, resolution }),
  })
  log(`裁决 #${r.id} 已关闭：${resolution}`, 'ok')
  rulingInput.value[r.id] = ''
  await loadStatus()
}

// ---------- 判定单 ----------
async function createTicket() {
  const t = ticketForm.value
  if (!t.role || !t.actionName) { log('立单需要角色和行动名', 'warn'); return }
  // 判定单直接写库（与 gm_ticket 工具同表同语义）
  const { DatabaseSync } = await import('../../node_modules/node:sqlite').catch(() => ({}))
  // 浏览器端无法直接写库——改走后端（临时用 actions 接口不可行，M1 先提示走 GM 工具）
  log('浏览器端不直接建单：请在 dsh 会话用 gm_ticket 立单，或由引擎回放脚本写入（面板展示判定单状态）', 'warn')
  void DatabaseSync
}

async function attachTicket(t) {
  // 挂点用统一入口
  const roll = prompt(`输入 ${t.role} · ${t.action_name} 的骰子出目（目标 ${t.target ?? '?'}）`)
  if (roll == null || roll === '') return
  const r = await fetch('/api/engine/tickets/attach', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: t.id, roll: Number(roll) }),
  })
  const body = await r.json()
  if (r.status === 409) log(body.error, 'error')
  else if (body.ok) log(`判定单 #${t.id} 挂点 ${roll}/${t.target ?? '?'} → ${body.verdict}`, 'ok')
  await loadStatus()
}

// ---------- 工具 ----------
function unitLabel(key) { return key }
function unitLabelOf(key) { return key }
function chainOf(actionKey) {
  // 从 status.actions 里找不到 phase——M1 简化：按 action_rules 的 phase 从引擎状态推断有难度，
  // 直接按 action_key 前缀归类展示（展示用途）
  return null
}
const groupedActions = computed(() => {
  const groups = {}
  for (const a of status.value?.actions ?? []) {
    const key = a.settle_note?.startsWith('已登记') ? '效果结算（M2）' : (a.action_key ?? '其他')
    ;(groups[key] ??= []).push(a)
  }
  // 按 CHAIN 顺序排
  const ordered = []
  for (const k of CHAIN) if (groups[k]) { ordered.push([k, groups[k]]); delete groups[k] }
  for (const k of Object.keys(groups)) ordered.push([k, groups[k]])
  return ordered
})

// ---------- 公告检查（一键读各私组公告，催未交行动） ----------
const napcatBase = ref(localStorage.getItem('engine-napcat-base') ?? 'http://127.0.0.1:3000')
const noticeCheck = ref(null)     // { checked, missing, failed, summary }
const noticeLoading = ref(false)
const groupBindings = ref([])     // 群映射列表
const groupForm = ref({ groupId: '', groupName: '', kind: 'private', class: '' })

async function saveNapcatBase() {
  localStorage.setItem('engine-napcat-base', napcatBase.value)
}

async function loadGroups() {
  if (!campaignId.value) return
  const r = await fetch(`/api/engine/groups?campaignId=${campaignId.value}`)
  groupBindings.value = await r.json()
}

async function addGroup() {
  const g = groupForm.value
  if (!g.groupId) { log('添加群映射需要群号', 'warn'); return }
  const r = await fetch('/api/engine/groups', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaignId: campaignId.value, ...g }),
  })
  if (r.ok) {
    log(`群映射已添加：${g.groupName || g.groupId}（${g.kind}${g.class ? '/' + g.class : ''}）`, 'ok')
    groupForm.value = { groupId: '', groupName: '', kind: 'private', class: '' }
    await loadGroups()
  } else {
    log('添加失败：' + (await r.json()).error, 'error')
  }
}

async function removeGroup(g) {
  await fetch(`/api/engine/groups/${g.id}`, { method: 'DELETE' })
  log(`已删除群映射：${g.group_name || g.group_id}`, 'warn')
  await loadGroups()
}

async function checkNotices() {
  if (!campaignId.value) { log('请先选择战役', 'warn'); return }
  await saveNapcatBase()
  noticeLoading.value = true
  try {
    const r = await fetch('/api/engine/notices/check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId: campaignId.value, napcatBase: napcatBase.value }),
    })
    const body = await r.json()
    if (!r.ok) { log('公告检查失败：' + body.error, 'error'); return }
    noticeCheck.value = body
    log(`公告检查完成：${body.summary.submitted}/${body.summary.total} 组已交，${body.summary.missing} 组未交${body.summary.failed ? `，${body.summary.failed} 组读取失败` : ''}`, body.summary.missing || body.summary.failed ? 'warn' : 'ok')
    for (const c of body.checked) {
      log(`  ${c.hasNotice ? '✓' : '✗'} ${c.class}${c.confirmed ? '（已确认）' : ''}${c.latestText ? '：' + c.latestText.slice(0, 50) : '（无公告）'}`, c.hasNotice ? 'info' : 'warn')
    }
    for (const f of body.failed) log(`  读取失败 ${f.class}: ${f.error}`, 'error')
  } finally { noticeLoading.value = false }
}

async function remindMissing() {
  const missing = (noticeCheck.value?.checked ?? []).filter(c => !c.hasNotice)
    .map(c => ({ groupId: c.groupId, class: c.class }))
  if (!missing.length) { log('没有需要提醒的组（都已交公告）', 'info'); return }
  noticeLoading.value = true
  try {
    const r = await fetch('/api/engine/notices/remind', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignId: campaignId.value, napcatBase: napcatBase.value, groups: missing,
        round: round.value, phase: phase.value,
      }),
    })
    const body = await r.json()
    log(`提醒已发送：${(body.sent ?? []).join('、') || '无'}${(body.failed ?? []).length ? `（失败 ${(body.failed ?? []).length}）` : ''}`, body.ok ? 'ok' : 'warn')
  } finally { noticeLoading.value = false }
}

onMounted(async () => {
  await loadCampaigns()
  await loadGroups()
  await loadStatus()
})
</script>

<template>
  <div class="eng">
    <!-- ===== 头部状态栏 ===== -->
    <header class="eng-head">
      <div class="eng-title">
        <span class="eng-mark"></span>
        <h1>{{ campaignName }} · 行动引擎</h1>
        <span class="eng-sub" :class="ready ? 'is-ok' : 'is-warn'">{{ ready ? '● 就绪' : '● 待处理' }}</span>
      </div>
      <div class="eng-controls">
        <label>
          战役
          <select class="campaign-select" v-model.number="campaignId" @change="onCampaignChange">
            <option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <label>回合 <input type="number" min="1" max="14" v-model.number="round" @change="loadStatus" /></label>
        <label>
          时段
          <select v-model="phase" @change="loadStatus">
            <option>昼</option><option>夜</option>
          </select>
        </label>
        <button class="eng-btn eng-btn-primary" :disabled="loading" @click="advance">推 进</button>
        <button class="eng-btn" :disabled="loading" @click="loadStatus">刷新</button>
      </div>
    </header>

    <!-- ===== 三栏主体 ===== -->
    <div class="eng-body">
      <!-- 左：结算链 -->
      <aside class="eng-col eng-col-chain">
        <h2>结算链</h2>
        <ol class="chain">
          <li v-for="(c, i) in ['机动','魂食','干涉','解放','制造','信息','休整','摧毁工房']" :key="c"
              :class="{ current: groupedActions.some(([k]) => k === c) }">
            <span class="chain-num">{{ i + 1 }}</span>{{ c }}
          </li>
        </ol>
        <h2>对账（引擎视角）</h2>
        <ul class="totals">
          <li v-for="t in totals" :key="t.role">
            <span>{{ t.role }}</span><b :class="t.total < 0 ? 'neg' : 'pos'">{{ t.total > 0 ? '+' : '' }}{{ t.total }}</b>
          </li>
          <li v-if="!totals.length" class="empty">推进后显示流水合计</li>
        </ul>
      </aside>

      <!-- 中：行动登记 -->
      <section class="eng-col eng-col-main">
        <h2>行动登记 · {{ phase }}</h2>
        <form class="reg-form" @submit.prevent="registerAction">
          <select v-model="formUnit">
            <option v-for="u in unitOptions" :key="u" :value="u">{{ u }}</option>
          </select>
          <input v-model="formText" placeholder="行动文本（如：机动 灵脉-B / 魂食 / 广泛侦查）" />
          <button class="eng-btn" type="submit" :disabled="loading">登记</button>
        </form>

        <div v-if="!groupedActions.length" class="empty-block">本时段还没有登记行动。左侧选择结算链阶段，上方登记行动。</div>

        <div v-for="[chain, list] in groupedActions" :key="chain" class="act-group">
          <h3>{{ chain }}</h3>
          <div v-for="a in list" :key="a.id" class="act-row" :class="'st-' + a.status">
            <span class="act-unit">{{ a.unit_key }}</span>
            <span class="act-name">{{ a.action_key }}<template v-if="a.target"> → {{ a.target }}</template></span>
            <span class="act-note">{{ a.settle_note ?? '待结算' }}</span>
            <button class="act-del" title="移除" @click="removeAction(a)">×</button>
          </div>
        </div>
      </section>

      <!-- 右：公告检查 / 需裁决 / 判定单 / 待办 -->
      <aside class="eng-col eng-col-side">
        <h2>公告检查 <em>{{ noticeCheck ? `${noticeCheck.summary.submitted}/${noticeCheck.summary.total}` : '' }}</em></h2>
        <div class="notice-form">
          <input v-model="napcatBase" placeholder="NapCat HTTP 地址" @change="saveNapcatBase" />
          <div class="notice-btns">
            <button class="eng-btn" :disabled="noticeLoading" @click="checkNotices">检查公告</button>
            <button class="eng-btn" :disabled="noticeLoading || !noticeCheck" @click="remindMissing">催未交</button>
          </div>
        </div>
        <div v-if="noticeCheck" class="notice-result">
          <div v-for="c in noticeCheck.checked" :key="c.groupId" class="notice-row" :class="c.hasNotice ? 'ok' : 'miss'">
            <span>{{ c.class }}</span>
            <span class="notice-state">{{ c.hasNotice ? (c.confirmed ? '已确认' : '已交') : '未交' }}</span>
          </div>
          <div v-for="f in noticeCheck.failed" :key="'f' + f.groupId" class="notice-row fail">
            <span>{{ f.class }}</span><span class="notice-state">读取失败</span>
          </div>
        </div>

        <h2>群映射 <em>{{ groupBindings.length }}</em></h2>
        <div v-for="g in groupBindings" :key="g.id" class="ticket">
          <span>{{ g.group_name || g.group_id }}（{{ g.kind }}{{ g.class ? '/' + g.class : '' }}）</span>
          <button class="act-del" @click="removeGroup(g)">×</button>
        </div>
        <div class="reg-form group-add">
          <input v-model="groupForm.groupId" placeholder="群号" />
          <input v-model="groupForm.groupName" placeholder="备注名" />
          <select v-model="groupForm.kind">
            <option value="private">私组</option>
            <option value="leyline">灵脉群</option>
            <option value="public">公屏</option>
            <option value="gm">GM群</option>
          </select>
          <input v-model="groupForm.class" placeholder="职阶" />
          <button class="eng-btn" @click="addGroup">加</button>
        </div>

        <h2>需裁决 <em>{{ status?.pendingRulings?.length ?? 0 }}</em></h2>
        <div v-if="!(status?.pendingRulings?.length)" class="empty-block small">无待裁决事项</div>
        <div v-for="r in status?.pendingRulings ?? []" :key="r.id" class="ruling">
          <p class="ruling-ctx">#{{ r.id }} {{ r.context }}</p>
          <div class="ruling-form">
            <input v-model="rulingInput[r.id]" placeholder="裁决处置…" @keyup.enter="resolveRuling(r)" />
            <button class="eng-btn" @click="resolveRuling(r)">裁决</button>
          </div>
        </div>

        <h2>未挂判定单 <em>{{ status?.openTickets?.length ?? 0 }}</em></h2>
        <div v-if="!(status?.openTickets?.length)" class="empty-block small">无未挂点判定单</div>
        <div v-for="t in status?.openTickets ?? []" :key="t.id" class="ticket">
          <span>#{{ t.id }} {{ t.role }} · {{ t.action_name }}（目标 {{ t.target ?? '?' }}）</span>
          <button class="eng-btn" @click="attachTicket(t)">挂点</button>
        </div>

        <h2>GM 待办 <em>{{ todos.length }}</em></h2>
        <ul class="todos">
          <li v-for="(t, i) in todos" :key="i">{{ t }}</li>
          <li v-if="!todos.length" class="empty">推进后生成（拉群/补数据…）</li>
        </ul>
      </aside>
    </div>

    <!-- ===== 底部日志 ===== -->
    <footer class="eng-log">
      <h2>引擎日志</h2>
      <div class="log-box" ref="logBox">
        <p v-for="(l, i) in logLines" :key="i" :class="'log-' + l.kind">
          <time>{{ l.ts }}</time>{{ l.text }}
        </p>
        <p v-if="!logLines.length" class="empty">引擎待命。登记行动后按「推进」开始结算。</p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* ===== 全局底色与字体 ===== */
.eng {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #121317;
  color: #e8e6e3;
  font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
  font-size: 14px;
}
.eng h1, .eng h2, .eng h3 { font-weight: 600; letter-spacing: .04em; }
.eng h2 {
  font-size: 12px; color: #9a9db0; text-transform: none;
  border-left: 3px solid #ff8a2a; padding-left: 8px; margin: 14px 0 8px;
}
.eng h2 em { font-style: normal; color: #ff8a2a; }
.empty { color: #565a6e; }
.empty-block {
  color: #565a6e; padding: 18px 12px; text-align: center;
  border: 1px dashed #34374a;
}
.empty-block.small { padding: 8px; font-size: 12px; }

/* ===== 头部 ===== */
.eng-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; background: #1b1d24;
  border-bottom: 1px solid #34374a;
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 16px) 100%, 0 100%);
}
.eng-title { display: flex; align-items: center; gap: 10px; }
.eng-title h1 { font-size: 17px; margin: 0; }
.eng-mark {
  width: 14px; height: 14px; background: #ff8a2a;
  clip-path: polygon(0 0, 100% 0, 100% 70%, 70% 100%, 0 100%);
}
.eng-sub { font-size: 12px; }
.eng-sub.is-ok { color: #5dd39e; }
.eng-sub.is-warn { color: #f5c542; }
.eng-controls { display: flex; align-items: center; gap: 10px; }
.eng-controls label { font-size: 12px; color: #9a9db0; display: flex; align-items: center; gap: 5px; }
.eng-controls input, .eng-controls select {
  background: #121317; color: #e8e6e3; border: 1px solid #34374a; padding: 4px 6px; width: 56px;
}
.eng-controls .campaign-select { width: auto; min-width: 110px; }
.eng-btn {
  background: #23262f; color: #e8e6e3; border: 1px solid #4a4e63;
  padding: 6px 14px; cursor: pointer; font-size: 13px; letter-spacing: .08em;
  clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px);
}
.eng-btn:hover { border-color: #ff8a2a; color: #ff8a2a; }
.eng-btn:disabled { opacity: .4; cursor: wait; }
.eng-btn-primary { background: #ff8a2a; color: #16171c; border-color: #ff8a2a; font-weight: 700; }
.eng-btn-primary:hover { background: #ffa04d; color: #16171c; }

/* ===== 三栏主体 ===== */
.eng-body {
  flex: 1; display: grid;
  grid-template-columns: 200px 1fr 300px;
  gap: 1px; background: #34374a;
}
.eng-col { background: #1b1d24; padding: 12px 14px; overflow-y: auto; max-height: calc(100vh - 118px); }

/* 结算链导航 */
.chain { list-style: none; margin: 0; padding: 0; }
.chain li {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 8px; color: #9a9db0; border-bottom: 1px solid #23262f;
}
.chain li.current { color: #ff8a2a; background: #23262f; }
.chain-num { font-family: ui-monospace, monospace; font-size: 11px; color: #565a6e; }

/* 对账 */
.totals { list-style: none; margin: 0; padding: 0; font-family: ui-monospace, monospace; font-size: 13px; }
.totals li { display: flex; justify-content: space-between; padding: 4px 8px; border-bottom: 1px solid #23262f; }
.totals .pos { color: #5dd39e; }
.totals .neg { color: #ff5c5c; }

/* 行动登记 */
.reg-form { display: flex; gap: 6px; margin-bottom: 12px; }
.reg-form select, .reg-form input {
  background: #121317; color: #e8e6e3; border: 1px solid #34374a; padding: 7px 8px; font-size: 13px;
}
.reg-form select { width: 86px; }
.reg-form input { flex: 1; }
.act-group { margin-bottom: 14px; }
.act-group h3 { font-size: 13px; color: #c8cbd8; margin: 0 0 6px; }
.act-row {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 10px; margin-bottom: 4px; background: #1f222b;
  border-left: 3px solid #4a4e63;
}
.act-row.st-settled { border-left-color: #5dd39e; }
.act-row.st-deferred { border-left-color: #f5c542; }
.act-row.st-declared { border-left-color: #6aa6ff; }
.act-unit { font-weight: 700; min-width: 44px; }
.act-name { min-width: 120px; }
.act-note { flex: 1; font-size: 12px; color: #9a9db0; }
.act-del {
  background: none; border: none; color: #565a6e; font-size: 15px; cursor: pointer;
}
.act-del:hover { color: #ff5c5c; }

/* 右栏 */
.notice-form { display: flex; flex-direction: column; gap: 6px; }
.notice-form input {
  background: #121317; color: #e8e6e3; border: 1px solid #34374a; padding: 5px 8px; font-size: 12px;
}
.notice-btns { display: flex; gap: 6px; }
.notice-btns .eng-btn { flex: 1; padding: 5px 8px; font-size: 12px; }
.notice-result { margin-bottom: 8px; }
.notice-row {
  display: flex; justify-content: space-between; padding: 4px 8px; margin-bottom: 3px;
  font-size: 12px; background: #1f222b;
}
.notice-row.ok .notice-state { color: #5dd39e; }
.notice-row.miss .notice-state { color: #ff5c5c; font-weight: 700; }
.notice-row.fail .notice-state { color: #9a9db0; }
.group-add { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.group-add input, .group-add select {
  background: #121317; color: #e8e6e3; border: 1px solid #34374a; padding: 4px 6px; font-size: 12px;
}
.ruling, .ticket {
  background: #1f222b; padding: 8px 10px; margin-bottom: 8px; font-size: 12px;
}
.ruling-ctx { margin: 0 0 6px; color: #f5c542; }
.ruling-form { display: flex; gap: 6px; }
.ruling-form input {
  flex: 1; background: #121317; color: #e8e6e3; border: 1px solid #34374a; padding: 5px 8px; font-size: 12px;
}
.ticket { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.todos { list-style: none; margin: 0; padding: 0; font-size: 12px; }
.todos li { padding: 5px 8px; border-bottom: 1px solid #23262f; color: #f5c542; }

/* ===== 底部日志 ===== */
.eng-log { background: #121317; border-top: 1px solid #34374a; padding: 8px 16px 12px; }
.eng-log h2 { margin-top: 4px; }
.log-box {
  height: 150px; overflow-y: auto; background: #0d0e12;
  border: 1px solid #23262f; padding: 8px 10px;
  font-family: ui-monospace, Consolas, monospace; font-size: 12px; line-height: 1.7;
}
.log-box p { margin: 0; white-space: pre-wrap; }
.log-box time { color: #565a6e; margin-right: 8px; }
.log-ok { color: #5dd39e; }
.log-warn { color: #f5c542; }
.log-error { color: #ff5c5c; }
.log-head { color: #ff8a2a; font-weight: 700; }

/* 滚动条统一 */
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-thumb { background: #34374a; }
::-webkit-scrollbar-track { background: #121317; }
</style>
