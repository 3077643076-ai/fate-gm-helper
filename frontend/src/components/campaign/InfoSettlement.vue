<template>
  <div>
    <div class="page-head">
      <h2>信息结算 · 情报发送工作台</h2>
      <p>整理 → 选卡/选层级 → 预览 → 复制 → QQ 粘贴（独立页面防误发）</p>
    </div>

    <!-- 情报卡生成 -->
    <div class="sheet">
      <h3 class="sheet-title">情报卡生成</h3>
      <div class="card-row">
        <select v-model="selectedCardId" class="select">
          <option :value="null" disabled>选角色</option>
          <option v-for="c in cards" :key="c.id" :value="c.id">
            {{ c.code || c.class_name || ('卡#' + c.id) }}（{{ c.card_type === 'MASTER' ? '御主' : '从者' }}）
          </option>
        </select>
        <select v-model="level" class="select">
          <option :value="1">层级1 样貌+位置（广侦）</option>
          <option :value="2">层级2 基本资料+能力面板</option>
          <option :value="3">层级3 技能/礼装/工房</option>
          <option :value="4">层级4 全情报（真名猜测兑现）</option>
        </select>
        <button class="btn" :disabled="!selectedCard" @click="copyCard">复制情报卡文本</button>
      </div>
      <pre v-if="cardText" class="preview">{{ cardText }}</pre>
      <p v-if="copyMsg" class="sheet-note">{{ copyMsg }}</p>
    </div>

    <!-- 广泛侦查结果 -->
    <div class="sheet">
      <h3 class="sheet-title">广泛侦查结果（一键复制）</h3>
      <p class="sheet-note">内容：成功侦查的全场从者位置与样貌、灵脉人流/魔力量、结界工房情报。位置数据来自引擎登记。</p>
      <pre class="preview">{{ reconText || '（本回合没有可显示的侦查数据——引擎登记单位位置后自动出现）' }}</pre>
      <button class="btn small" :disabled="!reconText" @click="copyText(reconText, '侦查结果已复制')">复制为文本</button>
    </div>

    <!-- 发送记录（后端还没有实体，占位说明） -->
    <div class="sheet">
      <h3 class="sheet-title">发送记录</h3>
      <p class="empty-tip">
        发送记录（时间/内容摘要/发往群）需要后端台账支撑，属于后续批次。当前请 GM 自行在群里留档。
      </p>
    </div>
  </div>
</template>

<script setup>
// 信息结算页：情报卡按披露层级拼文本 + 广泛侦查结果 + 复制发送
import { ref, computed, watch } from 'vue'
import { useCurrentCampaign } from '../../composables/useCurrentCampaign'
import { listCharacterCards } from '../../services/characterCard'
import { getEngineStatus } from '../../services/engine'

const { current } = useCurrentCampaign()
const campaignId = computed(() => current.value?.id)

const cards = ref([])
const selectedCardId = ref(null)
const level = ref(1)
const copyMsg = ref('')
const locations = ref([])

const selectedCard = computed(() => cards.value.find(c => c.id === selectedCardId.value))

// JSON 字段安全解析（卡面字段都是 JSON 字符串）
function parseJson(v) {
  if (!v) return []
  try {
    const arr = JSON.parse(v)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

// 按层级拼情报卡文本
const cardText = computed(() => {
  const c = selectedCard.value
  if (!c) return ''
  const name = c.code || c.class_name || `卡#${c.id}`
  const cls = c.class_name || ''
  const loc = locations.value.find(l => l.unit_key && (name.includes(l.unit_key) || l.unit_key.includes(name)))
  const lines = []
  if (level.value >= 1) {
    lines.push(`【${name}】${cls}`)
    lines.push(`现处：${loc?.leyline || '未知'}（广侦层级仅到位置）`)
  }
  if (level.value >= 2) {
    lines.push(`等级 ${c.total_level ?? '—'}｜筋力 ${c.total_strength ?? '—'}｜耐久 ${c.total_endurance ?? '—'}｜敏捷 ${c.total_agility ?? '—'}｜魔力 ${c.total_mana ?? '—'}｜幸运 ${c.total_luck ?? '—'}｜宝具 ${c.total_noble_phantasm ?? '—'}`)
  }
  if (level.value >= 3) {
    const skills = [...parseJson(c.class_skills), ...parseJson(c.personal_skills)]
    if (skills.length) lines.push(`技能：${skills.map(s => s.name || s).join('、')}`)
    const ess = parseJson(c.craft_essences)
    if (ess.length) lines.push(`礼装：${ess.map(s => s.name || s).join('、')}`)
    const ws = parseJson(c.workshops)
    if (ws.length) lines.push(`工房：${ws.map(s => s.name || s).join('、')}`)
  }
  if (level.value >= 4) {
    const nps = parseJson(c.noble_phantasms)
    if (nps.length) lines.push(`宝具：\n${nps.map(n => `- ${n.name || n}`).join('\n')}`)
    lines.push(`（层级4=全情报，仅真名猜测成功后使用）`)
  }
  return lines.join('\n')
})

// 广泛侦查：单位位置一览
const reconText = computed(() => {
  if (!locations.value.length) return ''
  return '【广泛侦查结果】\n' + locations.value.map(l => `- ${l.unit_key}：${l.leyline || '未知'}`).join('\n')
})

async function copyText(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text)
    copyMsg.value = okMsg
  } catch {
    copyMsg.value = '复制失败：浏览器未授权剪贴板，请手动选择文本复制'
  }
}

function copyCard() {
  copyText(cardText.value, '情报卡已复制，去 QQ 粘贴')
}

async function refresh() {
  if (!campaignId.value) { cards.value = []; locations.value = []; return }
  try {
    const list = await listCharacterCards(0, 100, null, campaignId.value)
    cards.value = Array.isArray(list) ? list : (list?.items || [])
  } catch {
    cards.value = []
  }
  try {
    const s = await getEngineStatus(campaignId.value)
    locations.value = s.locations || []
  } catch {
    locations.value = []
  }
}

watch(campaignId, refresh, { immediate: true })
</script>

<style scoped>
.card-row { display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: center; }
.preview {
  margin: 0.7rem 0 0.4rem;
  padding: 0.7rem 0.9rem;
  background: var(--c-head);
  border: 1px solid var(--c-line);
  border-radius: var(--radius);
  font-size: 0.84rem;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
