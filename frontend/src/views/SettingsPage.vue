<script setup>
// 设置页：AI 助手配置 · QQ 群映射 · 行动口径 · 单位注册表 · 本地测试说明
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { privacy, scrub } from '../privacy'

const campaigns = ref([])
const campaignId = ref(null)
// 离开设置页自动回到「隐藏真名」，防止 GM 忘了关
onUnmounted(() => { privacy.hideRealNames = true })

// ---- AI 配置（agent_config KV，白名单键） ----
const cfg = ref({})
const cfgMsg = ref('')
const CFG_FIELDS = [
  { key: 'napcatHttpBase', label: 'NapCat HTTP 地址', placeholder: 'http://127.0.0.1:3000', hint: '读公告/发回执用；本地测试填假 NapCat' },
  { key: 'napcatWsUrl', label: 'NapCat WS 地址', placeholder: 'ws://127.0.0.1:3001', hint: '群消息监听（可选）' },
  { key: 'agentIntervalMinutes', label: '定时间隔（分钟）', placeholder: '30', hint: '最小 5' },
  { key: 'agentTokenBudget', label: 'LLM 单次预算（token）', placeholder: '20000', hint: '' },
  { key: 'agentCampaignId', label: '定时收行动的战役', placeholder: '999002', hint: '留空=不定时收' },
  { key: 'agentPhase', label: '默认时段', placeholder: '昼', hint: '公告头有时段时以公告为准' },
]
const agentStatus = ref(null)

// ---- 群映射 ----
const groups = ref([])
const gForm = ref({ groupId: '', groupName: '', kind: 'private', class: '', leyline: '' })
const KIND_TEXT = { private: '私组', leyline: '灵脉群', public: '公频', gm: 'GM 群' }

// ---- 口径 / 单位（只读） ----
const rules = ref([])
const units = ref([])

async function loadCfg() {
  const r = await fetch('/api/engine/agent/config')
  cfg.value = await r.json()
  try {
    const s = await fetch('/api/engine/agent/status')
    agentStatus.value = await s.json()
  } catch { /* 状态可不显示 */ }
}

async function saveCfg() {
  cfgMsg.value = ''
  const r = await fetch('/api/engine/agent/config', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...Object.fromEntries(CFG_FIELDS.map(f => [f.key, String(cfg.value[f.key] ?? '').trim()])),
      agentEnabled: cfg.value.agentEnabled === '1' || cfg.value.agentEnabled === true ? '1' : '0',
      agentLlmEnabled: cfg.value.agentLlmEnabled === '1' || cfg.value.agentLlmEnabled === true ? '1' : '0',
    }),
  })
  const body = await r.json().catch(() => ({}))
  cfgMsg.value = r.ok ? '已保存' : (body.error ?? `HTTP ${r.status}`)
  if (r.ok) cfg.value = body
}

async function loadGroups() {
  if (!campaignId.value) { groups.value = []; return }
  const r = await fetch(`/api/engine/groups?campaignId=${campaignId.value}`)
  const body = await r.json()
  groups.value = body.groups ?? body ?? []
}

async function addGroup() {
  const g = gForm.value
  if (!g.groupId) return
  const r = await fetch('/api/engine/groups', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaignId: campaignId.value, ...g }),
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) { cfgMsg.value = body.error ?? `HTTP ${r.status}`; return }
  gForm.value = { groupId: '', groupName: '', kind: 'private', class: '', leyline: '' }
  await loadGroups()
}

async function delGroup(g) {
  await fetch(`/api/engine/groups/${g.id}`, { method: 'DELETE' })
  await loadGroups()
}

async function loadStatic() {
  const [rr, ur] = await Promise.all([fetch('/api/engine/rules'), fetch('/api/engine/units')])
  rules.value = (await rr.json()).rules ?? []
  units.value = (await ur.json()).units ?? []
}

onMounted(async () => {
  const r = await fetch('/api/campaigns')
  const body = await r.json()
  campaigns.value = body.content ?? body ?? []
  const saved = localStorage.getItem('hub-campaign-id')
  campaignId.value = campaigns.value.some(c => c.id === Number(saved))
    ? Number(saved)
    : campaigns.value[0]?.id ?? null
  await Promise.all([loadCfg(), loadGroups(), loadStatic()])
})
watch(campaignId, (v) => { localStorage.setItem('hub-campaign-id', v ?? ''); loadGroups() })
</script>

<template>
  <div class="page">
    <header class="page-head">
      <h1>设置</h1>
      <p class="sub">AI 助手与 QQ 接入、群映射、口径与单位注册表</p>
    </header>

    <section class="card">
      <div class="card-title">AI 助手
        <em v-if="agentStatus?.collector?.connected" class="ok-dot">消息监听中</em>
        <label class="switch"><input v-model="cfg.agentEnabled" type="checkbox" true-value="1" false-value="0" /> 定时收行动</label>
      </div>
      <div class="grid">
        <label v-for="f in CFG_FIELDS" :key="f.key">
          {{ f.label }}
          <input v-model="cfg[f.key]" :placeholder="f.placeholder" />
          <span v-if="f.hint" class="hint">{{ f.hint }}</span>
        </label>
        <label>
          LLM 兜底
          <span class="switch"><input v-model="cfg.agentLlmEnabled" type="checkbox" true-value="1" false-value="0" /> 开启（关=纯规则，失败全进需裁决）</span>
        </label>
      </div>
      <div class="row-foot">
        <button class="btn-primary" @click="saveCfg">保存配置</button>
        <span v-if="cfgMsg" class="msg">{{ cfgMsg }}</span>
      </div>
    </section>

    <section class="card">
      <div class="card-title">QQ 群映射 <em>{{ groups.length }} 条</em>
        <select v-model="campaignId" class="inline-select">
          <option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.name ?? ('#' + c.id) }}</option>
        </select>
      </div>
      <div class="row">
        <input v-model="gForm.groupId" placeholder="群号" style="width:110px" />
        <input v-model="gForm.groupName" placeholder="群名（备注）" />
        <select v-model="gForm.kind">
          <option value="private">私组</option><option value="leyline">灵脉群</option>
          <option value="public">公频</option><option value="gm">GM 群</option>
        </select>
        <input v-if="gForm.kind === 'private'" v-model="gForm.class" placeholder="职阶（弓/术/枪…）" style="width:130px" />
        <input v-if="gForm.kind === 'leyline'" v-model="gForm.leyline" placeholder="对应灵脉名" />
        <button class="btn-primary" @click="addGroup">添加</button>
      </div>
      <table v-if="groups.length" class="tbl">
        <thead><tr><th>群号</th><th>群名</th><th>类型</th><th>职阶/灵脉</th><th></th></tr></thead>
        <tbody>
          <tr v-for="g in groups" :key="g.id">
            <td>{{ g.group_id }}</td>
            <td>{{ g.group_name || '—' }}</td>
            <td>{{ KIND_TEXT[g.kind] ?? g.kind }}</td>
            <td>{{ g.class || g.leyline || '—' }}</td>
            <td><button class="btn-ghost" @click="delGroup(g)">删除</button></td>
          </tr>
        </tbody>
      </table>
      <p v-else class="hint">该战役还没有群映射——一键统计/催未交/收行动都依赖它</p>
    </section>

    <section class="card">
      <div class="card-title">行动口径 <em>{{ rules.length }} 条</em></div>
      <table v-if="rules.length" class="tbl">
        <thead><tr><th>动词</th><th>主体</th><th>链位</th><th>基础率</th><th>魔力</th><th>限制</th><th>效果</th></tr></thead>
        <tbody>
          <tr v-for="r in rules" :key="r.action_key">
            <td class="mono">{{ r.action_key }}</td>
            <td>{{ r.who }}</td>
            <td>{{ r.phase }}</td>
            <td>{{ r.base_rate ?? '—' }}<span v-if="r.rate_formula" class="hint">（{{ r.rate_formula }}）</span></td>
            <td>{{ [r.mana_cost ? '-' + r.mana_cost : '', r.mana_gain ? '+' + r.mana_gain : ''].filter(Boolean).join(' / ') || '—' }}</td>
            <td>{{ scrub(r.limit_per) || '—' }}</td>
            <td class="effect">{{ scrub(r.effect_text) || '—' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="hint">口径为空——跑 <code>node backend-node/scripts/seed-action-rules.mjs</code> 灌入</p>
    </section>

    <section class="card">
      <div class="card-title">单位注册表 <em>{{ units.length }} 个</em>
        <label class="switch"><input type="checkbox" :checked="!privacy.hideRealNames" @change="privacy.hideRealNames = !$event.target.checked" /> 显示真名（仅本页，离开自动隐藏）</label>
      </div>
      <table v-if="units.length" class="tbl">
        <thead><tr><th>单位键</th><th>职阶</th><th>主体</th><th>角色卡（真名）</th><th>状态</th></tr></thead>
        <tbody>
          <tr v-for="u in units" :key="u.unit_key">
            <td class="mono">{{ u.unit_key }}</td>
            <td>{{ u.class }}</td>
            <td>{{ u.side }}</td>
            <td>{{ privacy.hideRealNames ? '（已隐藏）' : (u.card_code ?? u.code ?? '—') }}</td>
            <td>
              <span v-if="u.missing" class="badge bad">缺卡</span>
              <span v-else class="badge okb">已关联</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="hint">单位为空——跑 <code>node backend-node/scripts/seed-unit-registry.mjs</code> 灌入</p>
    </section>

    <section class="card">
      <div class="card-title">本地测试（不碰真 QQ）</div>
      <p class="hint">
        假 NapCat：<code>node tools/mock-napcat.mjs 3000</code> —— 公告写在 <code>tools/mock-napcat.json</code>（存盘即生效），
        上面的 NapCat HTTP 地址填 <code>http://127.0.0.1:3000</code>，然后到「战役处理」页点 AI 助手的「一键收行动」。
        引擎发的回执/催办会实时打在假 NapCat 控制台，浏览器开 <code>http://127.0.0.1:3000/</code> 可看发件箱。
      </p>
    </section>
  </div>
</template>

<style scoped>
.page { padding: 22px 26px; overflow: auto; }
.page-head h1 { margin: 0 0 4px; font-size: 20px; color: #e9edf5; }
.sub { margin: 0 0 16px; color: #7d8392; font-size: 13px; }
.card { background: #1e2029; border: 1px solid #2c2f3a; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; }
.card-title { font-size: 14px; color: #cdd3df; margin-bottom: 12px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.card-title em { font-style: normal; color: #6f7686; font-size: 12px; }
.ok-dot { color: #9ecb7d; font-size: 12px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px 16px; margin-bottom: 12px; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #8a90a0; }
input, select {
  background: #16171d; border: 1px solid #333744; color: #d7dae2;
  border-radius: 6px; padding: 6px 8px; font-size: 13px;
}
.inline-select { width: auto; font-size: 12px; padding: 3px 6px; }
.switch { display: flex; align-items: center; gap: 6px; color: #b9c1d0; font-size: 13px; cursor: pointer; }
.row { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; align-items: center; }
.row-foot { display: flex; align-items: center; gap: 12px; }
.btn-primary {
  background: #2f5f9e; border: 1px solid #3f77bd; color: #eaf2fc;
  border-radius: 6px; padding: 6px 16px; font-size: 13px; cursor: pointer;
}
.btn-ghost {
  background: transparent; border: 1px solid #3a3f4d; color: #aeb5c4;
  border-radius: 6px; padding: 3px 10px; font-size: 12px; cursor: pointer;
}
.btn-ghost:hover { border-color: #d87a7a; color: #e9a0a0; }
.msg { color: #9ecb7d; font-size: 13px; }
.hint { color: #626878; font-size: 12px; }
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl th { text-align: left; color: #7d8392; font-weight: 500; padding: 6px 8px; border-bottom: 1px solid #2c2f3a; }
.tbl td { padding: 6px 8px; border-bottom: 1px solid #262933; vertical-align: top; }
.mono { font-family: Consolas, monospace; color: #a8c7ec; }
.effect { color: #9aa1b0; max-width: 380px; }
.badge { font-size: 11px; padding: 1px 8px; border-radius: 9px; }
.bad { background: #3a2727; color: #e0a0a0; }
.okb { background: #273327; color: #9ecb7d; }
code { background: #16171d; border: 1px solid #333744; border-radius: 4px; padding: 1px 5px; font-size: 12px; }
</style>
