<script setup>
// 技能提交确认页：GM 在这里处理玩家从 QQ 发来的技能提交
// 流程：玩家消息入库(pending) → GM 看解析结果、改段勾选、补匹配 → 确认(或丢弃)
// 确认时可以顺手把玩家用的缩写存成别名，下次自动识别
import { ref, computed, onMounted } from 'vue'
import { listCampaigns } from '../../services/campaign'
import { getSkillTemplate, listSkillTemplates } from '../../services/skillTemplate'
import {
  previewSubmission, createSubmission, listSubmissions,
  confirmSubmission, discardSubmission,
  listSkillAliases, deleteSkillAlias,
} from '../../services/skillSubmission'

// ---------- 页面基础状态 ----------
const campaigns = ref([])
const selectedCampaignId = ref(null)
const message = ref('')
const loading = ref(false)

// ---------- 提交列表 ----------
const submissions = ref([])          // 全部提交记录（含已处理）
const showProcessed = ref(false)     // 是否展开已处理列表

// ---------- 手动录入区（GM 代粘玩家消息） ----------
const inputText = ref('')
const inputUser = ref('')
const inputUnit = ref('')
const previewResult = ref(null)      // 试解析结果 { items, unknownShards }

// ---------- 别名管理 ----------
const aliases = ref([])

// 全量模板列表：GM 手选模板时用（惰性加载，不阻塞页面）
const allTemplates = ref([])

// 模板效果缓存：templateId -> effects 数组（用于渲染段勾选列表）
const effectsCache = ref({})

// 待确认 / 已处理 分组
const pendingList = computed(() => submissions.value.filter(s => s.status === 'pending'))
const processedList = computed(() => submissions.value.filter(s => s.status !== 'pending'))

// ---------- 数据加载 ----------
async function loadCampaigns() {
  try {
    campaigns.value = await listCampaigns()
    if (campaigns.value.length > 0 && !selectedCampaignId.value) {
      selectedCampaignId.value = campaigns.value[0].id
    }
  } catch (err) {
    message.value = err.message || '加载战役列表失败'
  }
}

async function loadSubmissions() {
  if (!selectedCampaignId.value) return
  loading.value = true
  try {
    const res = await listSubmissions(selectedCampaignId.value)
    submissions.value = res.content || []
    // 把条目涉及的模板效果都拉进缓存，供段勾选渲染
    for (const sub of submissions.value) {
      for (const item of sub.items || []) {
        if (item.templateId) await ensureEffects(item.templateId)
      }
    }
  } catch (err) {
    message.value = err.message || '加载提交记录失败'
  } finally {
    loading.value = false
  }
}

async function loadAliases() {
  if (!selectedCampaignId.value) return
  try {
    const res = await listSkillAliases(selectedCampaignId.value)
    aliases.value = res.content || []
  } catch (err) {
    aliases.value = []
  }
}

// 拉一次模板效果并缓存
async function ensureEffects(templateId) {
  if (effectsCache.value[templateId]) return
  try {
    const tpl = await getSkillTemplate(templateId)
    effectsCache.value[templateId] = tpl.effects || []
  } catch {
    effectsCache.value[templateId] = []
  }
}

// ---------- 解析预览 / 录入 ----------
async function doPreview() {
  message.value = ''
  if (!inputText.value.trim()) { message.value = '请先粘贴玩家消息'; return }
  try {
    previewResult.value = await previewSubmission(selectedCampaignId.value, inputText.value)
  } catch (err) {
    message.value = err.message || '解析失败'
  }
}

async function doSubmit() {
  message.value = ''
  if (!inputText.value.trim()) { message.value = '请先粘贴玩家消息'; return }
  try {
    await createSubmission(selectedCampaignId.value, inputText.value, {
      qqUser: inputUnit.value ? null : (inputUser.value || null),
      unitKey: inputUnit.value || null,
    })
    inputText.value = ''
    inputUser.value = ''
    previewResult.value = null
    message.value = '已入库，等待确认'
    await loadSubmissions()
  } catch (err) {
    message.value = err.message || '入库失败'
  }
}

// ---------- 条目辅助 ----------
// 该条目对应模板的段列表（带段号）
function segmentsOf(item) {
  const effects = effectsCache.value[item.templateId] || []
  return effects.map((seg, i) => ({
    segNo: i + 1,
    label: seg.label || seg.description || '未命名段',
    trigger: seg.trigger || 'active',
    aliases: seg.aliases || [],
  }))
}

// active 段总数（"全段发动"指的就是这些段）
function activeSegNos(item) {
  return segmentsOf(item).filter(s => s.trigger !== 'passive').map(s => s.segNo)
}

// 某段当前是否被勾选：segments=null 视为全勾
function isSegChecked(item, segNo) {
  if (item.segments === null || item.segments === undefined) return true
  return item.segments.includes(segNo)
}

// 勾/取消一个段：从 null（全勾）开始拆出数组
function toggleSeg(item, segNo) {
  if (item.segments === null || item.segments === undefined) {
    // 全勾状态取消某段 → 数组里保留其余 active 段
    item.segments = activeSegNos(item).filter(n => n !== segNo)
  } else if (item.segments.includes(segNo)) {
    item.segments = item.segments.filter(n => n !== segNo)
  } else {
    item.segments.push(segNo)
  }
}

// 全段发动：把 segments 重置为 null（等于全勾）
function setAllSegments(item) {
  item.segments = null
}

// 歧义字母翻转：把等级字母(D)解释成段位(D=第4段)
function flipGradeToSegment(item) {
  if (!item.grade) return
  const map = { A: 1, B: 2, C: 3, D: 4, E: 5 }
  const segNo = map[item.grade[0]]
  if (!segNo) return
  item.segments = item.segments === null || item.segments === undefined
    ? [segNo]
    : Array.from(new Set([...item.segments, segNo]))
  item.grade = null
  item.gradeAmbiguous = false
}

// GM 为未识别条目手选模板
function onManualPick(item, event) {
  const templateId = Number(event.target.value) || null
  item.templateId = templateId
  item.templateName = event.target.selectedOptions[0]?.textContent?.trim() || null
  item.matchType = templateId ? 'manual' : 'pending'
  item.candidates = []
  if (templateId) ensureEffects(templateId)
}

// 匹配方式徽章文案
function matchBadge(item) {
  const map = {
    alias: '别名命中', name: '名字命中', subsequence: '缩写猜中',
    manual: 'GM 手选', pending: '待处理',
  }
  return map[item.matchType] || item.matchType
}

// ---------- 确认 / 丢弃 ----------
async function confirmOne(sub) {
  loading.value = true
  message.value = ''
  try {
    // 收集 GM 勾了"记为别名"的缩写（只收已匹配上模板的条目）
    const saveAliases = (sub.items || [])
      .filter(i => i.saveAlias && i.templateId && i.aliasText)
      .map(i => i.aliasText)
    const res = await confirmSubmission(sub.id, sub.items, saveAliases)
    message.value = res.savedAliases && res.savedAliases.length
      ? `已确认（沉淀别名：${res.savedAliases.join('、')}）`
      : '已确认'
    await loadSubmissions()
    if (res.savedAliases && res.savedAliases.length) await loadAliases()
  } catch (err) {
    message.value = err.message || '确认失败'
  } finally {
    loading.value = false
  }
}

async function discardOne(sub) {
  loading.value = true
  message.value = ''
  try {
    await discardSubmission(sub.id)
    message.value = '已丢弃'
    await loadSubmissions()
  } catch (err) {
    message.value = err.message || '丢弃失败'
  } finally {
    loading.value = false
  }
}

// 删除别名（别名表小节的小叉号）
async function removeAlias(alias) {
  try {
    await deleteSkillAlias(alias.id)
    await loadAliases()
    message.value = `已删除别名「${alias.aliasText}」`
  } catch (err) {
    message.value = err.message || '删除别名失败'
  }
}

// ---------- 初始化 ----------
onMounted(async () => {
  await loadCampaigns()
  await loadSubmissions()
  await loadAliases()
  // 手选模板的备选列表，失败不阻塞页面
  try {
    const res = await listSkillTemplates(0, 200)
    allTemplates.value = res.content || []
  } catch {
    allTemplates.value = []
  }
})
</script>

<template>
  <div>
    <h2 class="page-title">技能提交确认</h2>
    <p class="page-desc">玩家在 QQ 发的技能提交先进入"待确认"队列，你核对解析结果（技能、等级、发动段）后点确认；认不准的会标出来，由你裁决。</p>

    <!-- 战役选择 -->
    <section class="block">
      <label class="field-label">战役：
        <select v-model.number="selectedCampaignId" class="select" @change="loadSubmissions(); loadAliases()">
          <option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </label>
      <span v-if="message" class="message">{{ message }}</span>
    </section>

    <!-- 手动录入：把玩家 QQ 消息粘进来 -->
    <section class="block">
      <h3 class="block-title">录入玩家消息</h3>
      <div class="input-row">
        <input v-model="inputUser" class="input small" placeholder="QQ昵称（可空）" />
        <input v-model="inputUnit" class="input small" placeholder="单位键，如 术从（可空）" />
        <button class="btn" @click="doPreview">试解析</button>
        <button class="btn primary" @click="doSubmit">入库待确认</button>
      </div>
      <textarea v-model="inputText" class="textarea" rows="2" placeholder='粘贴玩家消息，例如：.提交 魔境a 空花 丢群惩 神代魔术 发d级'></textarea>
      <div v-if="previewResult" class="preview-box">
        <div v-if="previewResult.items.length === 0" class="muted">没解析出任何技能</div>
        <div v-for="(item, idx) in previewResult.items" :key="idx" class="preview-item">
          {{ item.aliasText }}
          <span v-if="item.grade">（等级 {{ item.grade }}）</span>
          <span v-if="item.segments">（段 {{ item.segments.join('、') }}）</span>
          <span class="badge">{{ matchBadge(item) }}</span>
        </div>
        <div v-if="previewResult.unknownShards.length" class="warn-text">没认出来的碎片：{{ previewResult.unknownShards.join(' / ') }}</div>
      </div>
    </section>

    <!-- 待确认队列 -->
    <section class="block">
      <h3 class="block-title">待确认（{{ pendingList.length }}）</h3>
      <div v-if="pendingList.length === 0" class="muted">没有待确认的提交</div>
      <div v-for="sub in pendingList" :key="sub.id" class="card" :class="{ duplicate: sub.hasDuplicate }">
        <div class="card-head">
          <span class="who">{{ sub.unitKey || sub.qqUser || '未知提交人' }}</span>
          <span class="time">{{ sub.createdAt }}</span>
          <span v-if="sub.hasDuplicate" class="dup-flag">疑似重复提交</span>
        </div>
        <div class="raw-text">原文：{{ sub.rawText }}</div>

        <!-- 逐条解析结果 -->
        <div v-for="(item, idx) in sub.items" :key="idx" class="item" :class="{ 'item-dup': item.duplicate }">
          <div class="item-head">
            <strong>{{ item.aliasText }}</strong>
            <span class="badge" :class="{ warn: item.matchType === 'pending' }">{{ matchBadge(item) }}</span>
            <span v-if="item.duplicate" class="dup-flag">超次数</span>
          </div>

          <!-- 未匹配：提示 + GM 手选模板 -->
          <div v-if="item.matchType === 'pending'" class="pending-row">
            <span>没认出是哪个技能，手动选：</span>
            <select class="select small" :value="item.templateId || ''" @change="onManualPick(item, $event)">
              <option value="">-- 选择模板 --</option>
              <option v-for="cand in item.candidates" :key="'c' + cand.id" :value="cand.id">{{ cand.name }}（候选）</option>
              <option v-for="t in allTemplates" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </div>

          <div class="item-row">
            等级：<input v-model="item.grade" class="input tiny" placeholder="A/B/C…" />
            <button v-if="item.gradeAmbiguous && item.grade" class="btn tiny" @click="flipGradeToSegment(item)">
              {{ item.grade }} 可能是段位，转为第 {{ {A:1,B:2,C:3,D:4,E:5}[item.grade[0]] }} 段
            </button>
          </div>

          <!-- 段勾选：passive 段自动生效只展示；active 段可勾选 -->
          <div v-if="item.templateId && segmentsOf(item).length" class="seg-list">
            <button v-if="item.segments !== null" class="btn tiny" @click="setAllSegments(item)">恢复全段发动</button>
            <label v-for="seg in segmentsOf(item)" :key="seg.segNo" class="seg">
              <template v-if="seg.trigger === 'passive'">
                <span class="passive-tag">常驻自动生效</span>
              </template>
              <template v-else>
                <input type="checkbox" :checked="isSegChecked(item, seg.segNo)" @change="toggleSeg(item, seg.segNo)" />
              </template>
              第{{ seg.segNo }}段 {{ seg.label }}
              <span v-if="seg.aliases.length" class="muted">（俗称：{{ seg.aliases.join('、') }}）</span>
            </label>
          </div>

          <label class="alias-save">
            <input type="checkbox" v-model="item.saveAlias" :disabled="item.matchType === 'alias'" />
            记住"{{ item.aliasText }}"这个叫法（存为别名）
          </label>
        </div>

        <div class="card-actions">
          <button class="btn primary" :disabled="loading" @click="confirmOne(sub)">确认生效</button>
          <button class="btn" :disabled="loading" @click="discardOne(sub)">丢弃</button>
        </div>
      </div>
    </section>

    <!-- 已处理列表 -->
    <section class="block">
      <h3 class="block-title clickable" @click="showProcessed = !showProcessed">
        已处理（{{ processedList.length }}）{{ showProcessed ? '收起' : '展开' }}
      </h3>
      <div v-if="showProcessed">
        <div v-for="sub in processedList" :key="sub.id" class="card done">
          <div class="card-head">
            <span class="who">{{ sub.unitKey || sub.qqUser || '未知' }}</span>
            <span class="badge">{{ sub.status === 'confirmed' ? '已确认' : '已丢弃' }}</span>
            <span class="time">{{ sub.confirmedAt || sub.createdAt }}</span>
          </div>
          <div class="raw-text">原文：{{ sub.rawText }}</div>
        </div>
      </div>
    </section>

    <!-- 别名管理 -->
    <section class="block">
      <h3 class="block-title">别名表（{{ aliases.length }}）</h3>
      <div class="alias-list">
        <span v-for="a in aliases" :key="a.id" class="alias-chip" :title="a.global ? '全局别名' : '本战役别名'">
          {{ a.aliasText }} → {{ a.templateName || a.templateId }}
          <button class="chip-del" @click="removeAlias(a)">×</button>
        </span>
        <span v-if="aliases.length === 0" class="muted">还没有别名</span>
      </div>
    </section>
  </div>
</template>

<script>
// 手选模板时需要全量模板列表（惰性加载，不阻塞页面）
import { listSkillTemplates } from '../../services/skillTemplate'
export default {
  data() {
    return { allTemplates: [] }
  },
  async mounted() {
    try {
      const res = await listSkillTemplates(0, 200)
      this.allTemplates = res.content || []
    } catch {
      this.allTemplates = []
    }
  },
  methods: {
    async removeAlias(alias) {
      const { deleteSkillAlias } = await import('../../services/skillSubmission')
      await deleteSkillAlias(alias.id)
      this.aliasRemoveId = alias.id
    },
  },
}
</script>

<style scoped>
.page { max-width: 900px; margin: 0 auto; padding: 16px; }
.page-title { font-size: 22px; margin-bottom: 4px; }
.page-desc { color: #777; font-size: 13px; margin-bottom: 16px; }
.block { margin-bottom: 20px; }
.block-title { font-size: 16px; margin-bottom: 8px; }
.block-title.clickable { cursor: pointer; }
.field-label { font-size: 14px; }
.select { padding: 4px 8px; }
.select.small { padding: 2px 6px; font-size: 13px; }
.input { padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; }
.input.small { width: 160px; }
.input.tiny { width: 60px; padding: 2px 6px; }
.textarea { width: 100%; margin-top: 8px; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }
.input-row { display: flex; gap: 8px; align-items: center; }
.btn { padding: 4px 12px; border: 1px solid #bbb; border-radius: 4px; background: #fff; cursor: pointer; font-size: 13px; }
.btn.primary { background: #2f6fd0; color: #fff; border-color: #2f6fd0; }
.btn.tiny { padding: 1px 6px; font-size: 12px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.message { color: #2f6fd0; margin-left: 12px; font-size: 13px; }
.muted { color: #999; font-size: 13px; }
.warn-text { color: #b0650f; font-size: 13px; margin-top: 6px; }
.preview-box { margin-top: 8px; padding: 8px; background: #f5f7fa; border-radius: 4px; font-size: 13px; }
.preview-item { margin: 2px 0; }
.badge { display: inline-block; padding: 0 6px; margin-left: 6px; border-radius: 8px; background: #e4ecf7; color: #2f6fd0; font-size: 12px; }
.badge.warn { background: #f7e8d5; color: #b0650f; }
.card { border: 1px solid #ddd; border-radius: 6px; padding: 10px 12px; margin-bottom: 10px; }
.card.duplicate { border-color: #d05a5a; background: #fdf3f3; }
.card.done { opacity: 0.75; }
.card-head { display: flex; gap: 10px; align-items: center; margin-bottom: 6px; }
.who { font-weight: bold; }
.time { color: #999; font-size: 12px; }
.dup-flag { background: #d05a5a; color: #fff; padding: 0 8px; border-radius: 8px; font-size: 12px; }
.raw-text { font-size: 13px; color: #555; margin-bottom: 8px; }
.item { border-top: 1px dashed #e5e5e5; padding: 8px 0; }
.item-dup { background: #fdf3f3; }
.item-head { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.item-row { display: flex; align-items: center; gap: 8px; margin: 4px 0; font-size: 13px; }
.pending-row { font-size: 13px; margin: 4px 0; }
.seg-list { margin: 6px 0; display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
.seg { display: flex; align-items: center; gap: 4px; }
.passive-tag { background: #e7f0e7; color: #3a7a3a; font-size: 12px; padding: 0 6px; border-radius: 8px; }
.alias-save { font-size: 13px; color: #666; }
.card-actions { margin-top: 8px; display: flex; gap: 8px; }
.alias-list { display: flex; flex-wrap: wrap; gap: 6px; }
.alias-chip { background: #eef1f5; border-radius: 10px; padding: 2px 8px; font-size: 13px; }
.chip-del { border: none; background: none; cursor: pointer; color: #999; margin-left: 4px; }
</style>
