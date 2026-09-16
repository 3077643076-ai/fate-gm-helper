<template>
  <div>
    <div class="page-head">
      <h2>结算前 · 行动提交汇总</h2>
      <p>收行动 → 催交 → 汇总核对，全部齐了再去行动结算页</p>
    </div>

    <!-- 操作条（草图：一键收集/催交/关闭收行动/AI 代收） -->
    <div class="sheet op-bar">
      <button class="btn" :disabled="checking || !campaignId" @click="doCheckNotices">
        {{ checking ? '读取公告中…' : '查公告（检查各组是否交行动）' }}
      </button>
      <button class="btn" :disabled="reminding || !missingGroups.length" @click="doRemind">
        {{ reminding ? '发送提醒中…' : `一键催交未交者（${missingGroups.length}）` }}
      </button>
      <label class="phase-pick">
        收回合
        <select v-model="collectRound" class="select">
          <option v-for="r in allRounds" :key="r.turnNumber" :value="r.turnNumber">
            第{{ r.turnNumber }}回合 · {{ roundLabel(r.turnNumber) }}{{ r.status === 'OPEN' ? '（收集中）' : '' }}
          </option>
        </select>
      </label>
      <button class="btn" :disabled="collecting || !campaignId" @click="doAgentCollect">
        {{ collecting ? 'AI 收行动中…' : `AI 代收行动（${roundLabel(collectRound)}）` }}
      </button>
      <button class="btn" :class="{ 'mute-on': muted }" :disabled="muteBusy" @click="doToggleMute" :title="muted ? '机器人只读不发，收行动不受影响' : '点击开启静音：拦截一切发群消息'">
        {{ muteBusy ? '切换中…' : (muted ? '静音中（只读不发）' : '静音：拦截发消息') }}
      </button>
      <span v-if="opMsg" class="op-msg">{{ opMsg }}</span>
    </div>

    <!-- 公告检查结果（查公告后显示）：行动公告和状态记录分开展示，时段和收回合对齐 -->
    <div v-if="noticeResult" class="sheet">
      <h3 class="sheet-title">公告检查结果（对照正在收：{{ roundLabel(collectRound) }}）</h3>
      <table class="sheet-table">
        <thead>
          <tr><th>组别</th><th>交行动</th><th>公告时段</th><th>行动公告</th><th>状态记录</th></tr>
        </thead>
        <tbody>
          <tr v-for="(c, i) in noticeResult.checked" :key="i">
            <td>{{ c.class }}</td>
            <td :class="{ 'cell-auto': c.aligned }">
              <span class="dot" :class="alignedDot(c)" />
              {{ alignedText(c) }}
            </td>
            <td>
              <span v-if="c.noticeTurn" class="rel-badge" :data-level="c.aligned ? 'high' : 'medium'">
                {{ roundLabel(c.noticeTurn) }}
              </span>
              <span v-else class="rel-badge" data-level="low">未标时段</span>
            </td>
            <td>{{ c.actionText || '—' }}</td>
            <td>{{ c.hasStatus ? `【状态】${c.statusText}` : '—' }}</td>
          </tr>
          <tr v-for="(f, i) in noticeResult.failed" :key="'f' + i">
            <td>{{ f.class }}</td>
            <td><span class="dot off" /> 读取失败</td>
            <td colspan="3">{{ f.error }}</td>
          </tr>
        </tbody>
      </table>
      <p class="sheet-note">
        分类规则：时段开头/含"从者：御主："条目 = 行动公告；"状态记录/魔力数值" = 状态记录。
        公告时段和正在收的回合不一致的组（比如还停在第2天昼），催玩家把公告更新到本回合。
      </p>
    </div>

    <!-- 行动提交汇总表 -->
    <div class="sheet">
      <h3 class="sheet-title">本回合行动列表（Web / QQ 指令直提）</h3>
      <p class="sheet-note">轮次 {{ currentRoundLabel }} · 每组每类行动以最新一条为准</p>
      <table v-if="submissions.length" class="sheet-table">
        <thead>
          <tr><th>组别</th><th>代号 / 玩家</th><th>行动原文</th><th>归类</th></tr>
        </thead>
        <tbody>
          <tr v-for="s in submissions" :key="s.id">
            <td>{{ s.servantClass || '—' }}</td>
            <td>{{ s.submittedBy || '—' }}</td>
            <td class="content-cell">{{ s.content }}</td>
            <td>{{ s.actionType === 'SERVANT_ACTION' ? '从者行动' : '御主行动' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-tip">还没有指令直提的行动（这里只显示 .从者行动/.御主行动 指令提交的原文）。</p>
    </div>

    <!-- 引擎登记的行动：AI 代收/标准话术的解析结果（结构化后在这张表） -->
    <div class="sheet">
      <h3 class="sheet-title">引擎登记的行动（AI 代收 / 标准话术的结果）</h3>
      <p class="sheet-note">
        AI 代收把公告解析成结构化行动后登记在这里（对应{{ roundLabel(collectRound) }}）；
        上面那张表是 QQ 指令的原始原文，两边互不覆盖。
      </p>
      <table v-if="engineActions.length" class="sheet-table">
        <thead>
          <tr>
            <th>单位</th>
            <th>代号</th>
            <th>玩家（QQ 名）</th>
            <th>行动</th>
            <th>目标</th>
            <th>原文</th>
            <th>状态</th>
            <th>结算备注</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in engineActions" :key="a.id ?? `${a.unit_key}-${a.action_key}`">
            <td :title="a.groupName ? `${a.groupName}（${a.groupId}）` : ''">{{ a.unit_key }}</td>
            <td>
              {{ a.code || '—' }}
              <span v-if="a.card_missing === 1" class="warn-tip" style="font-size:0.72rem">（卡未对上）</span>
            </td>
            <td>{{ playerOf(a) }}</td>
            <td>{{ a.action_key }}</td>
            <td>{{ a.target || '—' }}</td>
            <td class="content-cell">{{ a.raw_text || '—' }}</td>
            <td :class="{ 'cell-auto': a.status === 'settled' }">{{ a.status }}</td>
            <td>{{ a.settle_note || '—' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="engineActions.length && !playersLoaded" class="sheet-note">
        玩家一列取自各职阶私组的群成员（机器人需在线）：{{ playersHint || '还没取到' }}
      </p>
      <p v-else class="empty-tip">
        引擎里还没有登记行动。点上方"AI 代收行动"解析各群公告后，结果会出现在这里。
      </p>
    </div>
  </div>
</template>

<script setup>
// 结算前页：行动提交汇总 + 公告检查 + 催交 + AI 代收
import { ref, computed, watch } from 'vue'
import { useCurrentCampaign } from '../../composables/useCurrentCampaign'
import { listCurrentSubmissions } from '../../services/actionSubmission'
import { getCurrentRound, listAllRounds, roundLabel, roundPhase } from '../../services/round'
import { getAgentConfig, checkNotices, remindGroups, runAgentCollect, getEngineStatus, listUnitPlayers } from '../../services/engine'
import { putOnebotConfig, getOnebotStatus } from '../../services/onebot'

const { current } = useCurrentCampaign()
const campaignId = computed(() => current.value?.id)

const submissions = ref([])
const currentRoundLabel = ref('—')
const noticeResult = ref(null)
const missingGroups = ref([])
const engineActions = ref([])      // 引擎登记的行动（AI 代收/标准话术解析结果），按选中回合拉
const unitPlayers = ref({})        // 职阶 → 私组群成员（QQ 名），来自 /api/engine/players
const playersHint = ref('')
const playersLoaded = ref(false)
const checking = ref(false)
const reminding = ref(false)
const collecting = ref(false)
const opMsg = ref('')
const allRounds = ref([])          // 全部回合（收回合下拉）
const collectRound = ref(null)     // 当前选中的收回合（turn_number）
const muted = ref(false)
const muteBusy = ref(false)

// 静音开关（机器人连接页也有大开关，这里就近放一个）
async function doToggleMute() {
  muteBusy.value = true
  try {
    const cfg = await putOnebotConfig({ muted: !muted.value })
    muted.value = !!cfg.muted
    opMsg.value = cfg.muted ? '已静音：机器人只读不发' : '已恢复发言'
  } catch (e) {
    opMsg.value = `切换失败：${e.message}`
  } finally {
    muteBusy.value = false
  }
}

// 时段对齐状态 → 状态列文案和颜色点：只在对齐时显示确认状态，
// 没对齐/没读到对应时段的公告就空出来（留白比满屏"未更新"清爽）
function alignedText(c) {
  if (c.aligned !== true) return '—'
  if (c.confirmed) return '已确认'
  return '有行动未确认'
}
function alignedDot(c) {
  if (c.aligned !== true) return 'off'
  if (c.confirmed) return 'ok'
  return 'warn'
}

async function refresh() {
  if (!campaignId.value) { submissions.value = []; allRounds.value = []; engineActions.value = []; return }
  try {
    submissions.value = await listCurrentSubmissions(campaignId.value)
  } catch {
    submissions.value = []
  }
  // 全回合列表：收回合下拉的数据源；默认选中 OPEN（收集中）的回合
  try {
    allRounds.value = await listAllRounds(campaignId.value)
    const openOne = allRounds.value.find(r => r.status === 'OPEN')
    if (openOne) collectRound.value = openOne.turnNumber
    else if (!allRounds.value.some(r => r.turnNumber === collectRound.value)) {
      collectRound.value = allRounds.value.at(-1)?.turnNumber ?? null
    }
  } catch {
    allRounds.value = []
  }
  try {
    const data = await getCurrentRound(campaignId.value)
    const r = data?.round
    currentRoundLabel.value = r ? `第 ${r.turnNumber} 回合（${roundLabel(r.turnNumber)}，${r.status === 'OPEN' ? '收集中' : '已关闭'}）` : '无回合'
  } catch {
    currentRoundLabel.value = '—'
  }
  // 顺带同步静音状态（机器人连接页切换后这里跟着变）
  try {
    const s = await getOnebotStatus()
    muted.value = !!s.muted
  } catch { /* 忽略 */ }
  // 引擎登记的行动：按当前选中的回合/时段拉（这张表在 09-16 重画时漏了数据源，
  // 模板上引用了未定义的 engineActions，导致整个"结算前"页渲染报错、内容空白）
  await loadEngineActions()
}

async function loadEngineActions() {
  if (!campaignId.value) { engineActions.value = []; return }
  try {
    const s = await getEngineStatus(campaignId.value, {
      round: collectRound.value,
      phase: roundPhase(collectRound.value),
    })
    engineActions.value = s?.actions || []
  } catch {
    engineActions.value = []
  }
  await loadUnitPlayers()
}

// 玩家（QQ 名）：职阶 → 私组群成员的群名片。机器人不在线时后端返回空，这里显示"—"并给出原因
async function loadUnitPlayers() {
  if (!campaignId.value) { unitPlayers.value = {}; playersLoaded.value = false; return }
  try {
    const r = await listUnitPlayers(campaignId.value)
    unitPlayers.value = r?.players || {}
    playersLoaded.value = Boolean(r?.botOnline)
    playersHint.value = r?.botOnline ? '' : r?.reason || '机器人未在线，先扫码登录后可取到群名片'
  } catch (e) {
    unitPlayers.value = {}
    playersLoaded.value = false
    playersHint.value = e.message
  }
}

// 某一行的玩家显示：该职阶私组里除机器人外的成员（通常就一个玩家）
function playerOf(action) {
  const g = unitPlayers.value?.[action.class]
  if (!g || !g.members?.length) return '—'
  return g.members.map((m) => m.name || m.qq).join('、')
}

// NapCat HTTP 地址：优先读 AI 助手配置；没配也能工作（后端指令优先走 WS 通道，
// 这里的地址只是 HTTP 回落兜底），所以查不到配置时给默认值而不是报错
async function getNapcatBase() {
  try {
    const cfg = await getAgentConfig()
    if (cfg?.napcatHttpBase) return cfg.napcatHttpBase
  } catch { /* 忽略 */ }
  return 'http://127.0.0.1:3000'
}

async function doCheckNotices() {
  checking.value = true
  opMsg.value = ''
  try {
    const base = await getNapcatBase()
    // expectedTurn：把正在收的回合传给后端，用来对齐各组公告的时段
    noticeResult.value = await checkNotices(campaignId.value, base, collectRound.value)
    // 催交名单 = 没交行动，或行动公告还停在旧时段（如收夜了公告还是昼）的组
    missingGroups.value = (noticeResult.value?.checked || [])
      .filter(c => !c.hasAction || (collectRound.value && c.aligned === false))
      .map(c => ({ class: c.class, groupId: c.groupId }))
    opMsg.value = noticeResult.value?.failed?.length
      ? `部分群读取失败（${noticeResult.value.failed.length}），其余见下表`
      : ''
  } catch (e) {
    opMsg.value = `检查失败：${e.message}`
  } finally {
    checking.value = false
  }
}

async function doRemind() {
  reminding.value = true
  try {
    const base = await getNapcatBase()
    if (!base) { opMsg.value = '未配置 NapCat HTTP 地址，无法发送提醒'; return }
    const r = await remindGroups(campaignId.value, base, missingGroups.value)
    opMsg.value = `已提醒：${(r.sent || []).join('、') || '无'}${r.failed?.length ? `；失败：${r.failed.map(f => f.class).join('、')}` : ''}`
  } catch (e) {
    opMsg.value = `催交失败：${e.message}`
  } finally {
    reminding.value = false
  }
}

async function doAgentCollect() {
  collecting.value = true
  opMsg.value = ''
  try {
    // 收回合：round=回合序号（turn_number），phase 按序号推（偶=昼 奇=夜）
    const r = await runAgentCollect(campaignId.value, collectRound.value, roundPhase(collectRound.value))
    if (typeof r?.summary === 'string' && r.summary) {
      opMsg.value = r.summary
    } else {
      // 拼一份摘要：登记/作废/催办，静音时催办全被拦截
      const parts = []
      if (r?.registered !== undefined) parts.push(`登记 ${r.registered} 条`)
      if (r?.voided !== undefined) parts.push(`作废旧行动 ${r.voided} 条`)
      if (r?.reminded !== undefined) parts.push(`催办 ${r.reminded} 组${muted.value ? '（已静音拦截）' : ''}`)
      opMsg.value = parts.length ? `AI 收行动完成：${parts.join('，')}` : 'AI 已完成一轮收集，详情见引擎日志'
    }
    await refresh()
  } catch (e) {
    opMsg.value = `AI 收行动失败：${e.message}`
  } finally {
    collecting.value = false
  }
}

watch(campaignId, refresh, { immediate: true })
// 换收回合时，引擎登记的行动表跟着换（下拉里的回合不同，登记结果也不同）
watch(collectRound, loadEngineActions)
</script>

<style scoped>
.op-bar { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 1rem; }
.op-msg { font-size: 0.84rem; color: var(--c-ink-2); }
.phase-pick { display: flex; align-items: center; gap: 0.35rem; font-size: 0.86rem; color: var(--c-ink-2); }
.btn.mute-on { background: var(--c-warn-soft); border-color: #d9a92e; color: var(--c-warn); }
.content-cell { max-width: 420px; }
</style>
