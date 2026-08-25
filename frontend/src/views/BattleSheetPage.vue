<template>
  <section class="battle-sheet-page" :class="{ 'settlement-locked': settlementConfirmed }">
    <div v-if="loading" class="loading">加载中...</div>

    <template v-else>
      <div v-if="pageError" class="page-alert error-alert">
        {{ pageError }}
      </div>
      <div v-else-if="servantCards.length === 0" class="page-alert warning-alert">
        当前战役还没有可用从者卡。请先上传或选择从者卡，再进入战斗表。
      </div>

      <header class="sheet-header">
        <div class="title-row">
          <h1>战斗表</h1>
          <label class="campaign-picker">
            <span>战役</span>
            <select v-model.number="selectedCampaignId" @change="onCampaignChanged">
              <option :value="null">-- 选择战役 --</option>
              <option v-for="campaign in campaigns" :key="campaign.id" :value="campaign.id">
                {{ campaign.name }}
              </option>
            </select>
          </label>
        </div>
        <div class="header-actions">
          <button class="btn-secondary" type="button" @click="copyReviewSnapshot" :disabled="saving">
            复制复盘摘要
          </button>
          <button class="btn-save" @click="saveSheet" :disabled="saving || settlementConfirmed">
            {{ saving ? '保存中...' : settlementConfirmed ? '已锁定' : '保存战斗表' }}
          </button>
          <span v-if="settlementConfirmed" class="lock-badge">已锁定{{ confirmedAt ? ` · ${formatConfirmedAt(confirmedAt)}` : '' }}</span>
          <span v-if="saveMsg" class="save-msg">{{ saveMsg }}</span>
        </div>
      </header>

      <div class="phase-flow-top">
        <PhaseNav
          :phases="PHASES"
          :current-phase="currentPhase"
          :phase-state="phaseState"
          :warnings-by-phase="warningsByPhase"
          @select="setCurrentPhase"
        />
      </div>

      <div class="phase-board-layout">
        <main class="phase-board-main">
          <div class="phase-content-layout">
            <div class="phase-content-primary">
          <FormationPanel
            :visible="currentPhase === 'FORMATION'"
            v-model:battlefield-width="battlefieldWidth"
            :is-confirmed="isCurrentPhaseConfirmed"
            :settlement-confirmed="settlementConfirmed"
            :blue-slots="blueSlots"
            :yellow-slots="yellowSlots"
            :servant-cards="servantCards"
            :stat-keys="statKeys"
            :blue-totals="blueTotals"
            :yellow-totals="yellowTotals"
            :formation-warnings="formationWarnings"
            :is-card-used="isCardUsed"
            :get-slot-display-name="getSlotDisplayName"
            :get-blue-stat="getBlueStat"
            :get-yellow-stat="getYellowStat"
            :format-stat-value="formatStatValue"
            :get-total-class="getTotalClass"
            @confirm-phase="confirmCurrentPhase"
            @reopen-phase="reopenCurrentPhase"
            @blue-selection-changed="onBlueSelectionChanged"
            @yellow-selection-changed="onYellowSelectionChanged"
            @set-yellow-slot-mode="setYellowSlotMode"
            @toggle-stat-editor="toggleStatEditor"
          />

          <section v-show="currentPhase !== 'FORMATION' && currentPhase !== 'RESULT'" class="phase-card">
            <PhaseConfirmBar
              :phase-label="currentPhaseMeta.label"
              :is-confirmed="isCurrentPhaseConfirmed"
              :settlement-confirmed="settlementConfirmed"
              @confirm="confirmCurrentPhase"
              @reopen="reopenCurrentPhase"
            />

            <SkillQueuePanel
              :phase-label="currentPhaseMeta.label"
              :queue="queueForCurrentPhase"
              :selected-skill-id="selectedSkill?.id || ''"
              @select-skill="selectSkillQueueItem"
              @update-skill="updateSkillQueueItem"
            />

            <BattleStartPanel
              :visible="currentPhase === 'BATTLE_START'"
              :tactics="tactics"
              v-model:blue-tactic="blueTactic"
              v-model:yellow-tactic="yellowTactic"
              :is-yellow-countered="isYellowCountered"
              :counter-text="counterText"
              v-model:blue-pre-battle-bonus="bluePreBattleBonus"
              v-model:blue-pre-battle-penalty="bluePreBattlePenalty"
              v-model:yellow-pre-battle-bonus="yellowPreBattleBonus"
              v-model:yellow-pre-battle-penalty="yellowPreBattlePenalty"
              :blue-slots="blueSlots"
              :yellow-slots="yellowSlots"
              :mana-blue="manaBlue"
              :mana-yellow="manaYellow"
              :get-slot-display-name="getSlotDisplayName"
            />

            <InitialSettlementPanel
              :visible="currentPhase === 'INITIAL'"
              :battle-stat-keys="battleStatKeys"
              v-model:compare-key1="compareKey1"
              v-model:compare-key2="compareKey2"
              v-model:compare-key3="compareKey3"
              :stat-comparisons="statComparisons"
              :stat-comparison-summary="statComparisonSummary"
              v-model:blue-attr-correction="blueAttrCorrection"
              v-model:yellow-attr-correction="yellowAttrCorrection"
              :correction-fields="correctionFields"
              :manual-corrections="manualCorrections"
              :get-stat-label="getStatLabel"
            />

            <MainPhasePanel
              :visible="currentPhase === 'MAIN'"
              :queue="queueForCurrentPhase"
            />

            <FinalCommandPanel
              :visible="currentPhase === 'FINAL'"
              v-model:blue-deathmatch="blueDeathmatch"
              v-model:yellow-deathmatch="yellowDeathmatch"
            />

          <PhaseEffectPanel
            :selected-skill="selectedSkill"
            :phase-label="currentPhaseMeta.label"
            :effects="currentPhaseEffects"
            :warnings="currentPhaseWarnings"
            :format-stat-bonus="formatStatBonus"
            :signed="signed"
          />

          <PhaseManualCorrectionPanel :corrections="currentPhaseCorrections" />
          </section>

          <BattleResultPanel
            :visible="currentPhase === 'RESULT'"
            :win-rate-chain="winRateChain"
            v-model:blue-guarantee="blueGuarantee"
            v-model:yellow-guarantee="yellowGuarantee"
            :saving="saving"
            :confirming="confirming"
            :settlement-confirmed="settlementConfirmed"
            @confirm="confirmSettlement"
          />
          </div>

          <aside class="phase-board-side phase-summary-top">
            <SkillImpactPreview :skill="selectedSkill" :phase-effects="currentPhaseEffects" />
            <BattleSummaryPanel
              :win-rate-chain="winRateChain"
              :stat-comparison-summary="statComparisonSummary"
              :warnings="phaseWarnings"
              :activated-summary="activatedTemplateSummary"
            />
            <ReviewHistoryPanel
              :items="reviewSnapshots"
              :selected-id="selectedReviewId"
              :loading="loadingReviews"
              :format-date="formatConfirmedAt"
              @refresh="loadReviewSnapshots"
              @select="selectedReviewId = $event"
            />
          </aside>
        </div>
        </main>
      </div>
    </template>
  </section>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getSelectedCampaign, listCampaigns, selectCampaign } from '../services/campaign'
import { getCurrentRound } from '../services/round'
import { listCharacterCards } from '../services/characterCard'
import { getOrCreateBattleSheet, updateBattleSheet, saveBattleReviewSnapshot, listBattleReviewSnapshots } from '../services/battleSheet'
import { listSkillTemplates } from '../services/skillTemplate'
import { updateCharacterStatus } from '../services/characterStatus'
import { calcManaShortage, compareStats, calcFinalWinRate, STAT_LABELS, DEFAULT_COMPARE_KEYS } from '../composables/useBattleCalculator'
import { collectStatusEffectsByCharacter, formatStatusEffectNotes } from '../composables/useBattleStatusEffects'
import {
  emptyStats,
  createBattleSlots,
  isCardUsedInSlots,
  attachCardsToSlots,
  getSlotStats,
  getSlotDisplayName,
  serializeSlots,
  restoreSlots,
} from '../composables/useBattleSideSlots'
import {
  PHASES,
  STATUS,
  createDefaultPhaseState,
  reopenPhaseAndDependents,
  buildSkillQueue,
  applyQueueEffects,
  getPhaseWarnings,
  normalizeSkillName,
} from '../composables/useBattlePhaseBoard'
import PhaseNav from '../components/battle/PhaseNav.vue'
import SkillQueuePanel from '../components/battle/SkillQueuePanel.vue'
import SkillImpactPreview from '../components/battle/SkillImpactPreview.vue'
import BattleSummaryPanel from '../components/battle/BattleSummaryPanel.vue'
import ReviewHistoryPanel from '../components/battle/ReviewHistoryPanel.vue'
import PhaseEffectPanel from '../components/battle/PhaseEffectPanel.vue'
import PhaseManualCorrectionPanel from '../components/battle/PhaseManualCorrectionPanel.vue'
import BattleResultPanel from '../components/battle/BattleResultPanel.vue'
import BattleStartPanel from '../components/battle/BattleStartPanel.vue'
import InitialSettlementPanel from '../components/battle/InitialSettlementPanel.vue'
import FinalCommandPanel from '../components/battle/FinalCommandPanel.vue'
import FormationPanel from '../components/battle/FormationPanel.vue'
import PhaseConfirmBar from '../components/battle/PhaseConfirmBar.vue'
import MainPhasePanel from '../components/battle/MainPhasePanel.vue'

const route = useRoute()
const router = useRouter()

const campaigns = ref([])
const selectedCampaignId = ref(null)

// ---------- 常量 ----------
const statKeys = [
  { key: 'level', label: '等级' },
  { key: 'strength', label: '筋力' },
  { key: 'endurance', label: '耐久' },
  { key: 'agility', label: '敏捷' },
  { key: 'mana', label: '魔力' },
  { key: 'luck', label: '幸运' },
  { key: 'noblePhantasm', label: '宝具' },
]

const tactics = ['强击', '破袭', '试探', '扼守']
const battleStatKeys = computed(() => statKeys.filter(sk => sk.key !== 'level'))

const counterMap = {
  '强击': '破袭',
  '破袭': '试探',
  '试探': '扼守',
  '扼守': '强击',
}

// 蓝方槽位：主力 + 3 辅助
const BLUE_SLOTS = [
  { key: 'MAIN', label: '主力位', isMain: true },
  { key: 'SUPPORT_1', label: '辅助位1', isMain: false },
  { key: 'SUPPORT_2', label: '辅助位2', isMain: false },
  { key: 'SUPPORT_3', label: '辅助位3', isMain: false },
]

// 黄方槽位：主力 + 3 辅助，保持和蓝方界面一致
const YELLOW_SLOTS = [
  { key: 'MAIN', label: '主力位', isMain: true },
  { key: 'SUPPORT_1', label: '辅助位1', isMain: false },
  { key: 'SUPPORT_2', label: '辅助位2', isMain: false },
  { key: 'SUPPORT_3', label: '辅助位3', isMain: false },
]

// ---------- 状态 ----------
const loading = ref(true)
const saving = ref(false)
const confirming = ref(false)
const saveMsg = ref('')
const pageError = ref('')
const turnNumber = ref(1)
const battlefieldWidth = ref(0)

// 战斗表自身
const sheetId = ref(null)
const campaignId = ref(null)
const roundId = ref(null)
const settlementConfirmed = ref(false)
const confirmedAt = ref(null)
const loadingReviews = ref(false)
const reviewSnapshots = ref([])
const selectedReviewId = ref(null)

// 角色卡
const servantCards = ref([])

// 蓝方槽位
const blueSlots = reactive(createBattleSlots(BLUE_SLOTS, 'card'))

// 黄方槽位
const yellowSlots = reactive(createBattleSlots(YELLOW_SLOTS, 'card'))

// 技能
const availableSkills = ref([])
const skillTemplates = ref([])
const phaseState = reactive(createDefaultPhaseState())
const skillQueue = ref([])
const selectedSkillId = ref('')
const manualCorrectionsByPhase = reactive({
  BATTLE_START: { blue: { stat: {}, winRate: 0, guarantee: 0, note: '' }, yellow: { stat: {}, winRate: 0, guarantee: 0, note: '' } },
  INITIAL: { blue: { stat: {}, winRate: 0, guarantee: 0, note: '' }, yellow: { stat: {}, winRate: 0, guarantee: 0, note: '' } },
  MAIN: { blue: { stat: {}, winRate: 0, guarantee: 0, note: '' }, yellow: { stat: {}, winRate: 0, guarantee: 0, note: '' } },
  FINAL: { blue: { stat: {}, winRate: 0, guarantee: 0, note: '' }, yellow: { stat: {}, winRate: 0, guarantee: 0, note: '' } },
})

// 战术
const blueTactic = ref('')
const yellowTactic = ref('')
const blueDeathmatch = ref(false)
const yellowDeathmatch = ref(false)

// 战前修正
const bluePreBattleBonus = ref(0)
const bluePreBattlePenalty = ref(0)
const yellowPreBattleBonus = ref(0)
const yellowPreBattlePenalty = ref(0)

// ---------- 魔力消耗 ----------
function emptyMana() {
  return { current: 0, consumption: 0, remaining: 0, penalty: 0, level: '正常' }
}

const manaBlue = reactive({})
const manaYellow = reactive({})
for (const s of BLUE_SLOTS) manaBlue[s.key] = reactive(emptyMana())
for (const s of YELLOW_SLOTS) manaYellow[s.key] = reactive(emptyMana())

// 自动更新魔力计算
watch(
  () => {
    const deps = []
    for (const s of BLUE_SLOTS) { deps.push(manaBlue[s.key].current); deps.push(manaBlue[s.key].consumption) }
    for (const s of YELLOW_SLOTS) { deps.push(manaYellow[s.key].current); deps.push(manaYellow[s.key].consumption) }
    return deps
  },
  () => {
    for (const s of BLUE_SLOTS) {
      const r = calcManaShortage(manaBlue[s.key].current || 0, manaBlue[s.key].consumption || 0)
      manaBlue[s.key].remaining = r.remaining
      manaBlue[s.key].penalty = r.penalty
      manaBlue[s.key].level = r.level
    }
    for (const s of YELLOW_SLOTS) {
      const r = calcManaShortage(manaYellow[s.key].current || 0, manaYellow[s.key].consumption || 0)
      manaYellow[s.key].remaining = r.remaining
      manaYellow[s.key].penalty = r.penalty
      manaYellow[s.key].level = r.level
    }
  },
  { deep: true, immediate: true }
)

function parseJsonObject(value, fallback = {}) {
  if (!value) return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}


const skillTemplateMap = computed(() => {
  const map = new Map()
  for (const template of skillTemplates.value) {
    map.set(normalizeSkillName(template.name), template)
  }
  return map
})

const currentPhase = computed(() => phaseState.currentPhase || 'FORMATION')
const currentPhaseMeta = computed(() => PHASES.find(phase => phase.key === currentPhase.value) || PHASES[0])
const isCurrentPhaseConfirmed = computed(() => Boolean(phaseState.phases?.[currentPhase.value]?.confirmed))
const queueForCurrentPhase = computed(() => skillQueue.value.filter(item => item.phase === currentPhase.value))
const selectedSkill = computed(() => skillQueue.value.find(item => item.id === selectedSkillId.value) || queueForCurrentPhase.value[0] || null)
const allQueueEffects = computed(() => applyQueueEffects({ queue: skillQueue.value }))
const currentPhaseEffects = computed(() => applyQueueEffects({ queue: skillQueue.value, phaseKey: currentPhase.value }))
const phaseWarnings = computed(() => getPhaseWarnings({ queue: skillQueue.value, phaseState }))
const currentPhaseWarnings = computed(() => {
  const label = currentPhaseMeta.value.label
  return phaseWarnings.value.filter(warning => warning.startsWith(`${label}：`) || warning.startsWith(label))
})
const warningsByPhase = computed(() => {
  const counts = {}
  for (const warning of phaseWarnings.value) {
    for (const phase of PHASES) {
      if (warning.startsWith(phase.label)) counts[phase.key] = (counts[phase.key] || 0) + 1
    }
  }
  return counts
})
const currentPhaseCorrections = computed(() => manualCorrectionsByPhase[currentPhase.value] || null)
const selectedReview = computed(() => reviewSnapshots.value.find(item => item.id === selectedReviewId.value) || null)

const formationWarnings = computed(() => {
  const warnings = []
  if (!blueSlots.some(slot => slot.card)) warnings.push('蓝方还没有选择参战角色卡。')
  if (!yellowSlots.some(slot => slot.card)) warnings.push('黄方还没有选择参战角色卡；正式敌人建议先建卡再选择。')
  const manualYellow = yellowSlots.filter(slot => slot.mode === 'manual' && (slot.name || Object.values(slot.stats || {}).some(Boolean)))
  if (manualYellow.length) warnings.push(`黄方有 ${manualYellow.length} 个临时手动槽位，不会自动带入技能/宝具。`)
  return warnings
})

const phaseManualWinRate = computed(() => {
  const result = {
    blueInitial: 0,
    yellowInitial: 0,
    blueMain: 0,
    yellowMain: 0,
    blueGuarantee: 0,
    yellowGuarantee: 0,
  }
  const addPhase = (phaseKey, targetKey) => {
    const data = manualCorrectionsByPhase[phaseKey]
    if (!data) return
    result[`blue${targetKey}`] += Number(data.blue?.winRate) || 0
    result[`yellow${targetKey}`] += Number(data.yellow?.winRate) || 0
    result.blueGuarantee += Number(data.blue?.guarantee) || 0
    result.yellowGuarantee += Number(data.yellow?.guarantee) || 0
  }
  addPhase('BATTLE_START', 'Initial')
  addPhase('INITIAL', 'Initial')
  addPhase('MAIN', 'Main')
  addPhase('FINAL', 'Main')
  return result
})

const activeTemplateEffects = computed(() => ({
  blueStats: allQueueEffects.value.blueStats,
  yellowStats: allQueueEffects.value.yellowStats,
  blueWinRate: allQueueEffects.value.blueWinRate,
  yellowWinRate: allQueueEffects.value.yellowWinRate,
  applied: allQueueEffects.value.applied,
  manual: allQueueEffects.value.manual,
}))

const activatedTemplateSummary = computed(() => {
  return [...activeTemplateEffects.value.applied, ...activeTemplateEffects.value.manual]
})

function getTemplateEffects(template) {
  if (!template) return []
  if (Array.isArray(template.effects)) return template.effects
  const effects = parseJsonObject(template.effectsJson, [])
  return Array.isArray(effects) ? effects : []
}

function getTemplateConditions(template) {
  if (!template) return []
  if (Array.isArray(template.conditions)) return template.conditions
  const conditions = parseJsonObject(template.conditionsJson, [])
  return Array.isArray(conditions) ? conditions : []
}

function describeEffect(effect) {
  if (!effect) return '需手动裁决'
  const valueText = effect.valueByRank || effect.values ? '按等级取值' : signed(effect.value)
  if (effect.kind === 'stat_modifier') return `${getStatLabel(effect.stat)}${valueText}`
  if (effect.kind === 'stat_group_modifier') return `${effect.group || '属性组'}${valueText}`
  if (effect.kind === 'win_rate_modifier') return `己方胜率${valueText}`
  if (effect.kind === 'enemy_win_rate_modifier') return `敌方胜率${valueText}`
  if (effect.kind === 'select_stat_modifier') return `选择属性${valueText}（需 GM 选择）`
  return effect.label || effect.text || '需手动裁决'
}
function describeSkillTemplate(template) {
  const effects = getTemplateEffects(template)
  if (effects.length) {
    const text = effects.map(describeEffect).join('，')
    return template.manualJudgment ? `${text}（需 GM 裁决）` : text
  }

  const parts = []
  const statText = formatStatBonus(parseJsonObject(template.statModifiers, {}))
  if (statText !== '无') parts.push(`属性 ${statText}`)
  if (template.winRateModifier) parts.push(`己方胜率${signed(template.winRateModifier)}`)
  if (template.enemyWinRateModifier) parts.push(`敌方胜率${signed(template.enemyWinRateModifier)}`)
  if (template.manaCost) parts.push(`消耗魔力${template.manaCost}`)
  if (template.statusEffects) parts.push('状态效果')
  if (template.manualJudgment) parts.push('需 GM 裁决')
  return parts.join('，') || '仅展示原文'
}

function formatStatBonus(stats) {
  const text = statKeys
    .filter(stat => stat.key !== 'level')
    .map(stat => ({ label: stat.label, value: Number(stats[stat.key]) || 0 }))
    .filter(stat => stat.value !== 0)
    .map(stat => `${stat.label}${signed(stat.value)}`)
    .join(' / ')
  return text || '无'
}

function signed(value) {
  const n = Number(value) || 0
  return `${n >= 0 ? '+' : ''}${n}`
}

// ---------- 属性结算 ----------
const compareKey1 = ref(DEFAULT_COMPARE_KEYS[0])
const compareKey2 = ref(DEFAULT_COMPARE_KEYS[1])
const compareKey3 = ref(DEFAULT_COMPARE_KEYS[2])
const blueAttrCorrection = ref(0)
const yellowAttrCorrection = ref(0)

const correctionFields = [
  { key: 'nonNoble', label: '宝外补正' },
  { key: 'allStats', label: '全属补正' },
  { key: 'topThree', label: '上三补正' },
]

const manualCorrections = reactive({
  blue: { nonNoble: 0, allStats: 0, topThree: 0 },
  yellow: { nonNoble: 0, allStats: 0, topThree: 0 },
})

const compareKeys = computed(() => [compareKey1.value, compareKey2.value, compareKey3.value])

// 带补正的总属性（补正×10加到每个属性上）
const blueSettledStats = computed(() => {
  const stats = { ...blueTotals.value }
  const corr = (blueAttrCorrection.value || 0) * 10
  applyStatCorrection(stats, corr)
  applyManualCorrection(stats, manualCorrections.blue)
  applyTemplateStatModifiers(stats, activeTemplateEffects.value.blueStats)
  return stats
})

const yellowSettledStats = computed(() => {
  const stats = { ...yellowTotals.value }
  const corr = (yellowAttrCorrection.value || 0) * 10
  applyStatCorrection(stats, corr)
  applyManualCorrection(stats, manualCorrections.yellow)
  applyTemplateStatModifiers(stats, activeTemplateEffects.value.yellowStats)
  return stats
})

function applyStatCorrection(stats, value) {
  for (const sk of statKeys) {
    if (sk.key !== 'level' && sk.key !== 'noblePhantasm') {
      stats[sk.key] = (stats[sk.key] || 0) + value
    }
  }
}

function applyManualCorrection(stats, correction) {
  const nonNoble = Number(correction.nonNoble) || 0
  const allStats = Number(correction.allStats) || 0
  const topThree = Number(correction.topThree) || 0

  for (const sk of statKeys) {
    if (sk.key !== 'level' && sk.key !== 'noblePhantasm') {
      stats[sk.key] = (stats[sk.key] || 0) + nonNoble
    }
    if (sk.key !== 'level') {
      stats[sk.key] = (stats[sk.key] || 0) + allStats
    }
  }
  for (const key of ['strength', 'endurance', 'agility']) {
    stats[key] = (stats[key] || 0) + topThree
  }
}

function applyTemplateStatModifiers(stats, modifiers) {
  for (const stat of statKeys) {
    if (stat.key === 'level') continue
    stats[stat.key] = (stats[stat.key] || 0) + (Number(modifiers[stat.key]) || 0)
  }
}

const statComparisons = computed(() => {
  return compareStats(blueSettledStats.value, yellowSettledStats.value, compareKeys.value).comparisons
})

const statComparisonSummary = computed(() => {
  return compareStats(blueSettledStats.value, yellowSettledStats.value, compareKeys.value)
})

function getStatLabel(key) {
  return STAT_LABELS[key] || key
}

// ---------- 最终胜率 ----------
const blueGuarantee = ref(0)
const yellowGuarantee = ref(0)

// 蓝方总属性（全部7属性合计）
const blueTotalAttrSum = computed(() => {
  let sum = 0
  for (const sk of statKeys) sum += (blueSettledStats.value[sk.key] || 0)
  return sum
})
const yellowTotalAttrSum = computed(() => {
  let sum = 0
  for (const sk of statKeys) sum += (yellowSettledStats.value[sk.key] || 0)
  return sum
})

// 只统计本次实际对比的三个属性，匹配 Excel E86：总值一 - 总值二
const comparedAttrDiff = computed(() => {
  let diff = 0
  for (const key of compareKeys.value) {
    diff += (blueSettledStats.value[key] || 0) - (yellowSettledStats.value[key] || 0)
  }
  return diff
})

const levelDiff = computed(() => (blueSettledStats.value.level || 0) - (yellowSettledStats.value.level || 0))

const winRateChain = computed(() => {
  const baseWinRate = statComparisonSummary.value.baseWinRate
  const attrDiff = comparedAttrDiff.value
  const bluePreBattle = (bluePreBattleBonus.value || 0) - (bluePreBattlePenalty.value || 0) + activeTemplateEffects.value.blueWinRate
  const yellowPreBattle = (yellowPreBattleBonus.value || 0) - (yellowPreBattlePenalty.value || 0) + activeTemplateEffects.value.yellowWinRate
  const phaseManual = phaseManualWinRate.value

  return calcFinalWinRate({
    baseWinRate,
    levelDiff: levelDiff.value,
    attrDiff,
    bluePreBattle,
    yellowPreBattle,
    blueInitial: phaseManual.blueInitial,
    yellowInitial: phaseManual.yellowInitial,
    blueMain: phaseManual.blueMain + (blueDeathmatch.value ? 20 : 0),
    yellowMain: phaseManual.yellowMain + (yellowDeathmatch.value ? 20 : 0),
    blueGuarantee: (blueGuarantee.value || 0) + phaseManual.blueGuarantee,
    yellowGuarantee: (yellowGuarantee.value || 0) + phaseManual.yellowGuarantee,
  })
})

// ---------- 计算属性 ----------

// 蓝方各属性总值（辅助减半）
const blueTotals = computed(() => {
  // 等级只取主力位，辅助位不参与总值，匹配 Excel G7/M7
  const totals = emptyStats()
  for (const slot of blueSlots) {
    if (slot.isMain) {
      totals.level = getSlotStats(slot, 'level')
    }
    const factor = slot.isMain ? 1 : 0.5
    for (const sk of statKeys) {
      if (sk.key === 'level') continue
      const v = getSlotStats(slot, sk.key)
      totals[sk.key] = (totals[sk.key] || 0) + v * factor
    }
  }
  return totals
})

// 黄方各属性总值（辅助减半）
const yellowTotals = computed(() => {
  // 等级只取主力位，辅助位不参与总值，匹配 Excel G7/M7
  const totals = emptyStats()
  for (const slot of yellowSlots) {
    if (slot.isMain) {
      totals.level = getSlotStats(slot, 'level')
    }
    const factor = slot.isMain ? 1 : 0.5
    for (const sk of statKeys) {
      if (sk.key === 'level') continue
      const v = getSlotStats(slot, sk.key)
      totals[sk.key] = (totals[sk.key] || 0) + v * factor
    }
  }
  return totals
})

// 黄方是否被克制
const isYellowCountered = computed(() => {
  if (!blueTactic.value || !yellowTactic.value) return false
  return counterMap[blueTactic.value] === yellowTactic.value
})

const counterText = computed(() => {
  if (!isYellowCountered.value) return ''
  return `${blueTactic.value} 克制 ${yellowTactic.value}，黄方战术失效`
})

// ---------- 方法 ----------
function isCardUsed(sideSlots, slotKey, cardId) {
  return isCardUsedInSlots(sideSlots, slotKey, cardId)
}

function syncManaFromSelectedCards() {
  for (const slot of blueSlots) {
    if (slot.card && !manaBlue[slot.key].current) {
      manaBlue[slot.key].current = Number(slot.card.totalStats?.mana) || 0
    }
  }
}

function onBlueSelectionChanged() {
  attachCardsToSlots(blueSlots, servantCards.value)
  syncManaFromSelectedCards()
  rebuildSkills()
}

function onYellowSelectionChanged() {
  for (const slot of yellowSlots) {
    if (slot.mode !== 'card') slot.cardId = null
  }
  attachCardsToSlots(yellowSlots, servantCards.value)
  rebuildSkills()
}

function setYellowSlotMode(slot, mode) {
  slot.mode = mode
  if (mode === 'manual') {
    slot.cardId = null
    slot.card = null
  }
  if (mode === 'card') {
    slot.showStats = false
  }
  onYellowSelectionChanged()
}

function rebuildSkills() {
  const seen = new Set()
  const skills = []
  for (const slot of blueSlots) {
    if (!slot.card) continue
    const card = slot.card
    const src = `${card.className || ''} ${card.code || ''}`.trim()

    const addSkills = (list, typeLabel) => {
      if (!list) return
      for (const s of list) {
        const name = s.name || ''
        if (!name || seen.has(name)) continue
        seen.add(name)
        skills.push({
          key: name,
          name,
          rank: s.rank || '',
          source: typeLabel,
          checked: false,
          template: skillTemplateMap.value.get(normalizeSkillName(name)) || null,
        })
      }
    }

    addSkills(card.classSkills, '职阶技能')
    addSkills(card.personalSkills, '固有技能')
    addSkills(card.noblePhantasms, '宝具')
  }
  // 保留已勾选状态
  const oldMap = new Map(availableSkills.value.map(s => [s.key, s.checked]))
  for (const sk of skills) {
    if (oldMap.has(sk.key)) sk.checked = oldMap.get(sk.key)
  }
  availableSkills.value = skills
  skillQueue.value = buildSkillQueue({
    blueSlots,
    yellowSlots,
    skillTemplateMap: skillTemplateMap.value,
    previousQueue: skillQueue.value,
  })
  syncAvailableSkillsFromQueue()
  if (!selectedSkillId.value && skillQueue.value.length) selectedSkillId.value = skillQueue.value[0].id
}

function isQueueItemActive(item) {
  return item.status === STATUS.APPLIED || item.status === STATUS.AUTO_ON
}

function syncAvailableSkillsFromQueue() {
  const activeNames = new Set(skillQueue.value.filter(isQueueItemActive).map(item => item.skillName))
  for (const sk of availableSkills.value) sk.checked = activeNames.has(sk.name)
}

function syncQueueFromAvailableSkills() {
  const activeNames = new Set(availableSkills.value.filter(sk => sk.checked).map(sk => sk.name))
  skillQueue.value = skillQueue.value.map(item => ({
    ...item,
    status: activeNames.has(item.skillName)
      ? (item.phase === 'PASSIVE' ? STATUS.AUTO_ON : STATUS.APPLIED)
      : (item.phase === 'PASSIVE' ? STATUS.AUTO_ON : STATUS.DISABLED),
  }))
}

function setAvailableSkillChecked(skill, checked) {
  skill.checked = checked
  skillQueue.value = skillQueue.value.map(item => item.skillName === skill.name ? {
    ...item,
    status: checked ? (item.phase === 'PASSIVE' ? STATUS.AUTO_ON : STATUS.APPLIED) : STATUS.DISABLED,
  } : item)
  const matched = skillQueue.value.find(item => item.skillName === skill.name)
  if (matched) selectedSkillId.value = matched.id
}

function setCurrentPhase(phaseKey) {
  phaseState.currentPhase = phaseKey
  const first = skillQueue.value.find(item => item.phase === phaseKey)
  if (first) selectedSkillId.value = first.id
}

function updateSkillQueueItem(nextItem) {
  skillQueue.value = skillQueue.value.map(item => item.id === nextItem.id ? nextItem : item)
  selectedSkillId.value = nextItem.id
  syncAvailableSkillsFromQueue()
}

function selectSkillQueueItem(skillId) {
  selectedSkillId.value = skillId
}

function confirmCurrentPhase() {
  if (settlementConfirmed.value) return
  if (!phaseState.phases[currentPhase.value]) phaseState.phases[currentPhase.value] = { confirmed: false }
  phaseState.phases[currentPhase.value].confirmed = true
}

function reopenCurrentPhase() {
  if (settlementConfirmed.value) return
  const reopened = reopenPhaseAndDependents(phaseState, currentPhase.value)
  if (reopened.length) {
    saveMsg.value = `已撤回：${reopened.join('、')}。请检查后续工序是否需要重新确认。`
    setTimeout(() => { saveMsg.value = '' }, 3500)
  }
}

function getBlueStat(slot, statKey) {
  return getSlotStats(slot, statKey)
}

function getYellowStat(slot, statKey) {
  return getSlotStats(slot, statKey)
}

function formatStatValue(val, isMain) {
  if (!isMain) return val / 2
  return val
}

function getTotalClass(statKey, side) {
  const blueV = blueTotals.value[statKey] || 0
  const yellowV = yellowTotals.value[statKey] || 0
  if (blueV === yellowV) return ''
  if (side === 'blue') return blueV > yellowV ? 'advantage' : 'disadvantage'
  return yellowV > blueV ? 'advantage' : 'disadvantage'
}

function toggleStatEditor(key) {
  const slot = yellowSlots.find(s => s.key === key)
  if (slot) slot.showStats = !slot.showStats
}

async function onCampaignChanged() {
  const nextCampaignId = Number(selectedCampaignId.value) || null
  if (!nextCampaignId || nextCampaignId === campaignId.value) return
  await selectCampaign(nextCampaignId)
  router.push(`/battle-sheet/${nextCampaignId}`)
}

// ---------- 数据加载 ----------
async function loadData() {
  loading.value = true
  pageError.value = ''
  try {
    const [campaignList, selectedCampaign] = await Promise.all([
      listCampaigns().catch(() => []),
      getSelectedCampaign().catch(() => null),
    ])
    campaigns.value = Array.isArray(campaignList) ? campaignList : []

    let cid = Number(route.params.campaignId) || null
    if (!cid) {
      cid = selectedCampaign?.id || null
    }
    selectedCampaignId.value = cid
    if (!cid) {
      pageError.value = '还没有选择战役。请先去战役控制页面选择一个战役，再打开战斗表。'
      return
    }

    // 并行加载：回合 + 角色卡 + 技能模板
    const [roundData, cardData, templateData] = await Promise.all([
      getCurrentRound(cid),
      listCharacterCards(0, 200, null, cid),
      listSkillTemplates(0, 500),
    ])

    const round = roundData?.round
    if (!round) {
      pageError.value = '当前战役还没有开启回合。请先在战斗控制台创建或进入当前回合。'
      return
    }

    campaignId.value = cid
    roundId.value = round.id
    turnNumber.value = round.turnNumber || 1

    // 只保留从者卡
    servantCards.value = (cardData?.content || []).filter(c => c.cardType === 'SERVANT')
    skillTemplates.value = templateData?.content || []

    // 获取或创建战斗表
    const sheet = await getOrCreateBattleSheet(cid, round.id)
    if (sheet) {
      sheetId.value = sheet.id
      applySheetData(sheet)
    }
    await loadReviewSnapshots()
  } catch (e) {
    console.error('加载战斗表失败', e)
    pageError.value = '加载战斗表失败：' + (e.message || '未知错误')
  } finally {
    loading.value = false
  }
}

function applySheetData(sheet) {
  const ga = parseJsonObject(sheet.groupAStats, {})
  const gb = parseJsonObject(sheet.groupBStats, {})

  Object.assign(phaseState, createDefaultPhaseState(ga.phaseState || {}))
  if (ga.manualCorrectionsByPhase) {
    for (const [phaseKey, value] of Object.entries(ga.manualCorrectionsByPhase)) {
      if (manualCorrectionsByPhase[phaseKey]) Object.assign(manualCorrectionsByPhase[phaseKey], value)
    }
  }

  // 编队
  restoreSlots(blueSlots, parseJsonObject(sheet.bluePositions, []), servantCards.value)
  restoreSlots(yellowSlots, parseJsonObject(sheet.yellowPositions, []), servantCards.value)
  syncManaFromSelectedCards()

  // 技能
  rebuildSkills()
  if (sheet.activatedSkills) {
    let as
    try {
      as = typeof sheet.activatedSkills === 'string' ? JSON.parse(sheet.activatedSkills) : sheet.activatedSkills
    } catch { as = [] }
    const activatedSet = new Set(as || [])
    for (const sk of availableSkills.value) {
      sk.checked = activatedSet.has(sk.name)
    }
    syncQueueFromAvailableSkills()
  }
  if (ga.skillQueue) {
    skillQueue.value = buildSkillQueue({
      blueSlots,
      yellowSlots,
      skillTemplateMap: skillTemplateMap.value,
      previousQueue: ga.skillQueue,
    })
  }
  syncAvailableSkillsFromQueue()
  if (!selectedSkillId.value && skillQueue.value.length) selectedSkillId.value = skillQueue.value[0].id

  // 战术
  blueTactic.value = sheet.blueTactic || ''
  yellowTactic.value = sheet.yellowTactic || ''

  // 战场宽度
  battlefieldWidth.value = sheet.battlefieldWidth || 0

  // 战前修正
  bluePreBattleBonus.value = sheet.bluePreBattleBonus || 0
  bluePreBattlePenalty.value = sheet.bluePreBattlePenalty || 0
  yellowPreBattleBonus.value = sheet.yellowPreBattleBonus || 0
  yellowPreBattlePenalty.value = sheet.yellowPreBattlePenalty || 0

  // 魔力消耗
  if (sheet.manaData) {
    let md
    try { md = typeof sheet.manaData === 'string' ? JSON.parse(sheet.manaData) : sheet.manaData } catch { md = {} }
    for (const side of ['blue', 'yellow']) {
      const items = md[side] || []
      const target = side === 'blue' ? manaBlue : manaYellow
      for (const item of items) {
        if (target[item.position]) {
          target[item.position].current = item.current || 0
          target[item.position].consumption = item.consumption || 0
        }
      }
    }
  }

  // 属性结算配置
  if (sheet.groupAStats) {
    if (ga.compareKeys) {
      compareKey1.value = ga.compareKeys[0] || DEFAULT_COMPARE_KEYS[0]
      compareKey2.value = ga.compareKeys[1] || DEFAULT_COMPARE_KEYS[1]
      compareKey3.value = ga.compareKeys[2] || DEFAULT_COMPARE_KEYS[2]
    }
    blueDeathmatch.value = Boolean(ga.deathmatch?.blue)
    yellowDeathmatch.value = Boolean(ga.deathmatch?.yellow)
    blueAttrCorrection.value = ga.attrCorrection || 0
    applyManualCorrectionData(manualCorrections.blue, ga.manualCorrections)
  }

  if (sheet.groupBStats) {
    yellowAttrCorrection.value = gb.attrCorrection || 0
    applyManualCorrectionData(manualCorrections.yellow, gb.manualCorrections)
  }

  // 胜率结果（保底）
  if (sheet.winRateResult) {
    let wr
    try { wr = typeof sheet.winRateResult === 'string' ? JSON.parse(sheet.winRateResult) : sheet.winRateResult } catch { wr = {} }
    blueGuarantee.value = wr.blueGuarantee || 0
    yellowGuarantee.value = wr.yellowGuarantee || 0
  }
  settlementConfirmed.value = Boolean(sheet.settlementConfirmed)
  confirmedAt.value = sheet.confirmedAt || null
}

function applyManualCorrectionData(target, source) {
  for (const field of correctionFields) {
    target[field.key] = Number(source?.[field.key]) || 0
  }
}

function formatConfirmedAt(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', { hour12: false })
}

async function loadReviewSnapshots() {
  if (!campaignId.value) return
  loadingReviews.value = true
  try {
    const list = await listBattleReviewSnapshots(campaignId.value)
    reviewSnapshots.value = Array.isArray(list) ? list : []
    if (selectedReviewId.value && !reviewSnapshots.value.some(item => item.id === selectedReviewId.value)) {
      selectedReviewId.value = null
    }
  } catch (e) {
    console.error('加载复盘历史失败', e)
  } finally {
    loadingReviews.value = false
  }
}

function serializeReviewSnapshot() {
  const formatSlots = slots => slots
    .filter(slot => slot.card || slot.name)
    .map(slot => `${slot.label}：${getSlotDisplayName(slot) || slot.name || '未填写'}`)
    .join('；') || '未选择'

  const confirmedPhases = PHASES
    .filter(phase => phaseState.phases?.[phase.key]?.confirmed)
    .map(phase => phase.label)
    .join('、') || '无'

  const activeSkills = skillQueue.value
    .filter(isQueueItemActive)
    .map(item => `${item.characterName} / ${item.skillName}（${item.effectiveRank || item.originalRank || '未填'}）`)

  const manualItems = skillQueue.value
    .filter(item => item.status === STATUS.MANUAL || item.manualJudgment || item.gmNote)
    .map(item => `${item.characterName} / ${item.skillName}：${item.gmNote || '需 GM 裁决'}`)

  const manualCorrectionNotes = Object.entries(manualCorrectionsByPhase)
    .flatMap(([phaseKey, data]) => {
      const phase = PHASES.find(item => item.key === phaseKey)?.label || phaseKey
      return ['blue', 'yellow'].map(side => {
        const sideLabel = side === 'blue' ? '蓝方' : '黄方'
        const item = data[side]
        const winRate = Number(item?.winRate) || 0
        const guarantee = Number(item?.guarantee) || 0
        const note = item?.note || ''
        if (!winRate && !guarantee && !note) return null
        return `${phase} ${sideLabel}：胜率${signed(winRate)}，保底${signed(guarantee)}${note ? `，备注：${note}` : ''}`
      }).filter(Boolean)
    })

  return [
    '# 战斗复盘摘要',
    `战役ID：${campaignId.value || '未选择'} / 回合：${turnNumber.value || '-'}`,
    `蓝方编队：${formatSlots(blueSlots)}`,
    `黄方编队：${formatSlots(yellowSlots)}`,
    `战术：蓝方 ${blueTactic.value || '未选'} / 黄方 ${yellowTactic.value || '未选'}${isYellowCountered.value ? `（${counterText.value}）` : ''}`,
    `确认工序：${confirmedPhases}`,
    `属性对比：${statComparisonSummary.value.summary}，基础胜率 ${statComparisonSummary.value.baseWinRate}%`,
    `最终胜率：蓝方 ${winRateChain.value.blueFinal}% / 黄方 ${winRateChain.value.yellowFinal}%`,
    `已生效技能：${activeSkills.length ? activeSkills.join('；') : '无'}`,
    `GM 裁决/备注：${manualItems.length ? manualItems.join('；') : '无'}`,
    `工序手动修正：${manualCorrectionNotes.length ? manualCorrectionNotes.join('；') : '无'}`,
  ].join('\n')
}

function buildReviewSnapshotPayload() {
  return {
    title: `第${turnNumber.value || '-'}回合战斗复盘`,
    turnNumber: turnNumber.value || null,
    summaryText: serializeReviewSnapshot(),
    snapshot: {
      campaignId: campaignId.value,
      roundId: roundId.value,
      turnNumber: turnNumber.value,
      bluePositions: serializeSlots(blueSlots),
      yellowPositions: serializeSlots(yellowSlots),
      tactics: {
        blue: blueTactic.value || '',
        yellow: yellowTactic.value || '',
        counterText: isYellowCountered.value ? counterText.value : '',
      },
      deathmatch: { blue: blueDeathmatch.value, yellow: yellowDeathmatch.value },
      phaseState: JSON.parse(JSON.stringify(phaseState)),
      manualCorrectionsByPhase: JSON.parse(JSON.stringify(manualCorrectionsByPhase)),
      skillQueue: skillQueue.value.map(item => ({
        id: item.id,
        side: item.side,
        position: item.position,
        characterId: item.characterId,
        characterName: item.characterName,
        skillName: item.skillName,
        originalRank: item.originalRank,
        effectiveRank: item.effectiveRank,
        phase: item.phase,
        status: item.status,
        selectedStat: item.selectedStat,
        target: item.target,
        manualJudgment: item.manualJudgment,
        gmNote: item.gmNote,
      })),
      statusEffects: Array.from(collectStatusEffectsByCharacter(skillQueue.value).entries()).map(([characterId, effects]) => ({
        characterId,
        effects: effects.map(effect => ({
          name: effect.name,
          type: effect.type,
          level: effect.level,
          sourceSkill: effect.sourceSkill,
        })),
      })),
      manaData: {
        blue: BLUE_SLOTS.map(s => ({
          position: s.key,
          current: manaBlue[s.key].current || 0,
          consumption: manaBlue[s.key].consumption || 0,
          remaining: manaBlue[s.key].remaining || 0,
          penalty: manaBlue[s.key].penalty || 0,
        })),
        yellow: YELLOW_SLOTS.map(s => ({
          position: s.key,
          current: manaYellow[s.key].current || 0,
          consumption: manaYellow[s.key].consumption || 0,
          remaining: manaYellow[s.key].remaining || 0,
          penalty: manaYellow[s.key].penalty || 0,
        })),
      },
      statComparison: statComparisonSummary.value,
      winRateResult: {
        baseWinRate: winRateChain.value.baseWinRate,
        levelDiff: winRateChain.value.levelDiff,
        attrDiff: winRateChain.value.attrDiff,
        bluePreBattle: winRateChain.value.bluePreBattle,
        yellowPreBattle: winRateChain.value.yellowPreBattle,
        blueInitial: winRateChain.value.blueInitial,
        yellowInitial: winRateChain.value.yellowInitial,
        blueMain: winRateChain.value.blueMain,
        yellowMain: winRateChain.value.yellowMain,
        blueGuarantee: blueGuarantee.value || 0,
        yellowGuarantee: yellowGuarantee.value || 0,
        blueFinal: winRateChain.value.blueFinal,
        yellowFinal: winRateChain.value.yellowFinal,
      },
    },
  }
}

async function copyReviewSnapshot() {
  const text = serializeReviewSnapshot()
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      saveMsg.value = '复盘摘要已复制'
    } else {
      window.prompt('复制复盘摘要', text)
      saveMsg.value = '已生成复盘摘要'
    }
  } catch {
    window.prompt('复制复盘摘要', text)
    saveMsg.value = '已生成复盘摘要'
  }
  setTimeout(() => { saveMsg.value = '' }, 2500)
}

// ---------- 保存 ----------
async function saveSheet(options = {}) {
  if (!sheetId.value) return false
  if (settlementConfirmed.value && !options.confirmSettlement) {
    saveMsg.value = '本回合战斗表已锁定，不能继续保存修改'
    return false
  }
  saving.value = true
  saveMsg.value = ''
  try {
    const payload = {
      campaignId: campaignId.value,
      roundId: roundId.value,
      bluePositions: JSON.stringify(serializeSlots(blueSlots)),
      yellowPositions: JSON.stringify(serializeSlots(yellowSlots)),
      activatedSkills: JSON.stringify(
        availableSkills.value.filter(s => s.checked).map(s => s.name)
      ),
      battlefieldWidth: battlefieldWidth.value || 0,
      blueTactic: blueTactic.value || '',
      yellowTactic: yellowTactic.value || '',
      bluePreBattleBonus: bluePreBattleBonus.value,
      bluePreBattlePenalty: bluePreBattlePenalty.value,
      yellowPreBattleBonus: yellowPreBattleBonus.value,
      yellowPreBattlePenalty: yellowPreBattlePenalty.value,
      manaData: JSON.stringify({
        blue: BLUE_SLOTS.map(s => ({
          position: s.key, current: manaBlue[s.key].current || 0, consumption: manaBlue[s.key].consumption || 0,
        })),
        yellow: YELLOW_SLOTS.map(s => ({
          position: s.key, current: manaYellow[s.key].current || 0, consumption: manaYellow[s.key].consumption || 0,
        })),
      }),
      groupAStats: JSON.stringify({
        compareKeys: [compareKey1.value, compareKey2.value, compareKey3.value],
        deathmatch: { blue: blueDeathmatch.value, yellow: yellowDeathmatch.value },
        attrCorrection: blueAttrCorrection.value || 0,
        manualCorrections: { ...manualCorrections.blue },
        templateEffects: {
          blueStats: activeTemplateEffects.value.blueStats,
          blueWinRate: activeTemplateEffects.value.blueWinRate,
          yellowWinRate: activeTemplateEffects.value.yellowWinRate,
          activated: activatedTemplateSummary.value,
          applied: activeTemplateEffects.value.applied,
          manual: activeTemplateEffects.value.manual,
        },
        phaseState: JSON.parse(JSON.stringify(phaseState)),
        skillQueue: skillQueue.value.map(item => ({
          id: item.id,
          side: item.side,
          position: item.position,
          characterId: item.characterId,
          characterName: item.characterName,
          skillName: item.skillName,
          originalRank: item.originalRank,
          effectiveRank: item.effectiveRank,
          phase: item.phase,
          status: item.status,
          selectedStat: item.selectedStat,
          target: item.target,
          manualJudgment: item.manualJudgment,
          gmNote: item.gmNote,
        })),
        manualCorrectionsByPhase: JSON.parse(JSON.stringify(manualCorrectionsByPhase)),
      }),
      groupBStats: JSON.stringify({
        attrCorrection: yellowAttrCorrection.value || 0,
        manualCorrections: { ...manualCorrections.yellow },
      }),
      winRateResult: JSON.stringify({
        baseWinRate: winRateChain.value.baseWinRate,
        levelDiff: winRateChain.value.levelDiff,
        attrDiff: winRateChain.value.attrDiff,
        bluePreBattle: winRateChain.value.bluePreBattle,
        yellowPreBattle: winRateChain.value.yellowPreBattle,
        blueK: winRateChain.value.blueK,
        yellowK: winRateChain.value.yellowK,
        halved: winRateChain.value.halved,
        blueGuarantee: blueGuarantee.value || 0,
        yellowGuarantee: yellowGuarantee.value || 0,
        blueFinal: winRateChain.value.blueFinal,
        yellowFinal: winRateChain.value.yellowFinal,
      }),
      settlementConfirmed: options.confirmSettlement ? true : false,
    }
    const updatedSheet = await updateBattleSheet(sheetId.value, payload)
    if (updatedSheet) {
      settlementConfirmed.value = Boolean(updatedSheet.settlementConfirmed)
      confirmedAt.value = updatedSheet.confirmedAt || null
    }
    saveMsg.value = '保存成功'
    setTimeout(() => { saveMsg.value = '' }, 2000)
    return true
  } catch (e) {
    console.error('保存失败', e)
    saveMsg.value = '保存失败: ' + (e.message || '未知错误')
    return false
  } finally {
    saving.value = false
  }
}

async function confirmSettlement() {
  if (settlementConfirmed.value) {
    saveMsg.value = '本回合战斗表已经确认锁定'
    return
  }

  const selectedBlueSlots = blueSlots.filter(slot => slot.mode === 'card' && slot.card)
  const selectedYellowSlots = yellowSlots.filter(slot => slot.mode === 'card' && slot.card)
  if (selectedBlueSlots.length === 0) {
    saveMsg.value = '请先选择蓝方参战角色'
    return
  }
  if (selectedYellowSlots.length === 0) {
    saveMsg.value = '请先选择黄方参战角色；正式敌人也建议建角色卡'
    return
  }

  if (phaseWarnings.value.length) {
    const unresolved = phaseWarnings.value.slice(0, 8).join('\n')
    const okWarnings = window.confirm(`还有未处理项目：\n${unresolved}\n\n确认这些已经由 GM 手动处理，并继续结算吗？`)
    if (!okWarnings) return
  }

  const ok = window.confirm('确认结算后，会把双方已选角色的剩余魔力写回当前回合状态。是否继续？')
  if (!ok) return

  confirming.value = true
  saveMsg.value = ''
  try {
    const saved = await saveSheet()
    if (!saved) return
    const statusEffectsByCharacter = collectStatusEffectsByCharacter(skillQueue.value)

    for (const slot of selectedBlueSlots) {
      const mana = manaBlue[slot.key]
      const statusEffectsList = statusEffectsByCharacter.get(slot.card.id) || []
      const statusNote = statusEffectsList.length ? `，状态：${formatStatusEffectNotes(statusEffectsList)}` : ''
      await updateCharacterStatus({
        characterCardId: slot.card.id,
        campaignId: campaignId.value,
        roundNumber: turnNumber.value,
        currentMana: mana.remaining || 0,
        manaLimit: slot.card.totalStats?.mana || null,
        statusEffectsList: statusEffectsList.length ? statusEffectsList : undefined,
        notes: `战斗表第${turnNumber.value}回合结算回写：${slot.label}，消耗${mana.consumption || 0}${statusNote}，最终胜率蓝方${winRateChain.value.blueFinal}% / 黄方${winRateChain.value.yellowFinal}%`,
      })
    }

    for (const slot of selectedYellowSlots) {
      const mana = manaYellow[slot.key]
      const statusEffectsList = statusEffectsByCharacter.get(slot.card.id) || []
      const statusNote = statusEffectsList.length ? `，状态：${formatStatusEffectNotes(statusEffectsList)}` : ''
      await updateCharacterStatus({
        characterCardId: slot.card.id,
        campaignId: campaignId.value,
        roundNumber: turnNumber.value,
        currentMana: mana.remaining || 0,
        manaLimit: slot.card.totalStats?.mana || null,
        statusEffectsList: statusEffectsList.length ? statusEffectsList : undefined,
        notes: `战斗表第${turnNumber.value}回合结算回写：${slot.label}，消耗${mana.consumption || 0}${statusNote}，最终胜率蓝方${winRateChain.value.blueFinal}% / 黄方${winRateChain.value.yellowFinal}%`,
      })
    }

    const lockedSheet = await updateBattleSheet(sheetId.value, { settlementConfirmed: true })
    settlementConfirmed.value = Boolean(lockedSheet?.settlementConfirmed)
    confirmedAt.value = lockedSheet?.confirmedAt || null

    await saveBattleReviewSnapshot(sheetId.value, buildReviewSnapshotPayload())
    await loadReviewSnapshots()

    saveMsg.value = `结算已确认，已回写双方${selectedBlueSlots.length + selectedYellowSlots.length}名角色魔力，并保存复盘快照`
    setTimeout(() => { saveMsg.value = '' }, 3000)
  } catch (e) {
    console.error('确认结算失败', e)
    saveMsg.value = '确认结算失败: ' + (e.message || '未知错误')
  } finally {
    confirming.value = false
  }
}

onMounted(loadData)
</script>

<style scoped>
.battle-sheet-page {
  padding: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
  color: #e0d8c0;
  background: #1a1a2e;
  min-height: 100vh;
}

.loading {
  text-align: center;
  padding: 3rem;
  font-size: 1.2rem;
  color: #888;
}

.page-alert {
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  border-radius: 6px;
  font-size: 0.95rem;
  line-height: 1.5;
}

.error-alert {
  border: 1px solid #9f4b4b;
  background: rgba(120, 35, 35, 0.35);
  color: #ffd2d2;
}

.warning-alert {
  border: 1px solid #9f874b;
  background: rgba(120, 92, 35, 0.28);
  color: #ffe6a8;
}

.sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.sheet-header h1 {
  margin: 0;
  font-size: 1.5rem;
  color: #f0c060;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.btn-save {
  padding: 0.5rem 1.5rem;
  background: #c0a040;
  color: #1a1a2e;
  border: none;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
  font-size: 0.95rem;
}

.btn-save:hover { background: #d4b450; }
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary {
  padding: 0.5rem 1rem;
  background: rgba(224, 216, 192, 0.08);
  color: #f0d890;
  border: 1px solid rgba(240, 216, 144, 0.45);
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
  font-size: 0.9rem;
}

.btn-secondary:hover { background: rgba(224, 216, 192, 0.16); }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-confirm {
  padding: 0.5rem 1rem;
  background: #355f9f;
  color: #f0f4ff;
  border: none;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
  font-size: 0.95rem;
}

.btn-confirm:hover { background: #4470b6; }
.btn-confirm:disabled { opacity: 0.5; cursor: not-allowed; }

.lock-badge {
  padding: 0.25rem 0.6rem;
  border: 1px solid #5f7fbf;
  border-radius: 999px;
  color: #c9d8ff;
  background: rgba(53, 95, 159, 0.25);
  font-size: 0.8rem;
}

.settlement-locked input,
.settlement-locked select,
.settlement-locked textarea {
  pointer-events: none;
  opacity: 0.7;
}

.save-msg {
  font-size: 0.85rem;
  color: #80c080;
}

/* ---------- 双方编队 ---------- */
.formations {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.side {
  background: #16213e;
  border-radius: 8px;
  padding: 1rem;
  border: 1px solid #2a3a5c;
}

.side h2 {
  margin: 0 0 0.75rem 0;
  font-size: 1.1rem;
  color: #d0b860;
}

.blue-side h2 { color: #6090d0; }
.yellow-side h2 { color: #d0a040; }

.field-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.field-row label {
  font-size: 0.85rem;
  white-space: nowrap;
}

.field-input {
  width: 80px;
  padding: 0.25rem 0.5rem;
  background: #1a1a2e;
  border: 1px solid #3a4a6c;
  color: #e0d8c0;
  border-radius: 3px;
}

.position-row {
  display: flex;
  align-items: flex-start;
  gap: 0.35rem;
  margin-bottom: 0.5rem;
  flex-wrap: wrap;
}

.pos-label {
  width: 70px;
  font-size: 0.85rem;
  color: #a0a8b8;
  flex-shrink: 0;
  line-height: 2;
}

.pos-select,
.mode-select {
  flex: 1;
  min-width: 150px;
  padding: 0.3rem 0.5rem;
  background: #1a1a2e;
  border: 1px solid #3a4a6c;
  color: #e0d8c0;
  border-radius: 3px;
}

.pos-card-name {
  font-size: 0.85rem;
  color: #80b0e0;
  line-height: 2;
}

.name-input {
  width: 120px;
  padding: 0.3rem 0.5rem;
  background: #1a1a2e;
  border: 1px solid #3a4a6c;
  color: #e0d8c0;
  border-radius: 3px;
}

.btn-edit-stats {
  padding: 0.25rem 0.6rem;
  font-size: 0.8rem;
  background: #2a3a5c;
  color: #c0b890;
  border: 1px solid #3a4a6c;
  border-radius: 3px;
  cursor: pointer;
}

.btn-mode-switch {
  padding: 0.12rem 0.28rem;
  font-size: 0.72rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-primary);
  background: #fff;
  cursor: pointer;
  white-space: nowrap;
}

.btn-mode-switch:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.manual-mode-hint {
  grid-column: 1 / -1;
  margin: 0.25rem 0 0;
  color: #d8bd79;
  font-size: 0.78rem;
}

.formation-warning-panel {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid rgba(216, 189, 121, 0.5);
  border-radius: 10px;
  background: rgba(120, 92, 35, 0.22);
}

.formation-warning-panel h3 {
  margin: 0 0 0.5rem;
  color: #f0c060;
}

.formation-warning-panel ul {
  margin: 0;
  padding-left: 1.2rem;
}

.stat-editor {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.35rem;
  width: 100%;
  margin-top: 0.35rem;
  padding: 0.5rem;
  background: #1a1a2e;
  border-radius: 4px;
}

.stat-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-cell label {
  font-size: 0.7rem;
  color: #888;
}

.stat-input {
  width: 100%;
  padding: 0.2rem 0.3rem;
  background: #0d0d1a;
  border: 1px solid #3a4a6c;
  color: #e0d8c0;
  border-radius: 2px;
  font-size: 0.8rem;
}

/* ---------- 属性对比表 ---------- */
.stat-table-section {
  margin-bottom: 1.5rem;
  background: #16213e;
  border-radius: 8px;
  padding: 1rem;
  border: 1px solid #2a3a5c;
}

.stat-table-section h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.1rem;
  color: #f0c060;
}

.hint {
  font-size: 0.8rem;
  color: #888;
  margin: 0 0 0.75rem 0;
}

.stat-table-wrap {
  overflow-x: auto;
}

.stat-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.stat-table th,
.stat-table td {
  padding: 0.35rem 0.5rem;
  border: 1px solid #2a3a5c;
  text-align: center;
  white-space: nowrap;
}

.stat-table th {
  background: #1a1a2e;
  color: #c0b080;
  font-weight: normal;
}

.stat-table .stat-name {
  text-align: left;
  color: #c0b080;
  font-weight: bold;
}

.total-col {
  font-weight: bold;
}

.advantage {
  color: #80e080;
}

.disadvantage {
  color: #e08080;
}

/* ---------- 技能 ---------- */
.skills-section {
  margin-bottom: 1.5rem;
  background: #16213e;
  border-radius: 8px;
  padding: 1rem;
  border: 1px solid #2a3a5c;
}

.skills-section h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.1rem;
  color: #f0c060;
}

.empty-hint {
  font-size: 0.85rem;
  color: #666;
  text-align: center;
  padding: 1rem;
}

.skill-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.5rem;
}

.skill-checkbox {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.6rem;
  background: #1a1a2e;
  border-radius: 6px;
  border: 1px solid #2a3a5c;
  cursor: pointer;
  font-size: 0.85rem;
  transition: border-color 0.2s, background 0.2s;
}

.skill-checkbox:hover {
  border-color: #4a5a7c;
}

.skill-checkbox.checked {
  border-color: #80b060;
  background: #1a2a1a;
}

.skill-name {
  color: #e0d8c0;
}

.skill-rank {
  color: #c0a040;
  font-size: 0.75rem;
}

.skill-source {
  color: #666;
  font-size: 0.7rem;
}

.skill-checkbox.matched {
  border-color: #806c36;
}

.template-hit,
.template-miss {
  justify-self: end;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  font-size: 0.68rem;
  white-space: nowrap;
}

.template-hit {
  color: #2a210f;
  background: #d6b257;
}

.template-miss {
  color: #8c8794;
  background: rgba(255, 255, 255, 0.06);
}

.skill-effect {
  grid-column: 2 / -1;
  color: #d6b257;
  font-size: 0.75rem;
  line-height: 1.4;
}

.manual-badge {
  grid-column: 2 / -1;
  justify-self: start;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  color: #f4d8d8;
  background: rgba(160, 48, 48, 0.38);
  font-size: 0.7rem;
}

.condition-list,
.skill-raw-text {
  grid-column: 1 / -1;
  color: #b8ac8c;
  font-size: 0.74rem;
  line-height: 1.45;
}

.condition-list p {
  margin: 0.12rem 0;
}

.skill-raw-text summary {
  cursor: pointer;
  color: #d6b257;
  font-weight: 700;
}

.skill-raw-text pre {
  white-space: pre-wrap;
  margin: 0.35rem 0 0;
  padding: 0.5rem;
  max-height: 140px;
  overflow: auto;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.18);
}

.template-summary {
  margin-top: 0.8rem;
  padding: 0.75rem;
  border: 1px solid #806c36;
  border-radius: 8px;
  background: rgba(214, 178, 87, 0.08);
}

.template-summary h3 {
  margin: 0 0 0.5rem;
  color: #d6b257;
  font-size: 0.95rem;
}

.summary-line {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.2rem 0;
  color: #c8c0a8;
  font-size: 0.82rem;
}

.summary-line strong {
  color: #f0d890;
}

.template-summary ul {
  margin: 0.4rem 0 0;
  padding-left: 1rem;
  color: #b8ac8c;
  font-size: 0.78rem;
}

/* ---------- 战术 ---------- */
.tactics-section {
  margin-bottom: 1.5rem;
  background: #16213e;
  border-radius: 8px;
  padding: 1rem;
  border: 1px solid #2a3a5c;
}

.tactics-section h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.1rem;
  color: #f0c060;
}

.tactics-row {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  margin-bottom: 0.5rem;
}

.tactic-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tactic-group label {
  font-size: 0.85rem;
  white-space: nowrap;
}

.tactic-group select {
  padding: 0.35rem 0.5rem;
  background: #1a1a2e;
  border: 1px solid #3a4a6c;
  color: #e0d8c0;
  border-radius: 3px;
  font-size: 0.9rem;
}

.tactic-group select.countered {
  border-color: #e06060;
  color: #e06060;
}

.tactic-vs {
  font-size: 1.2rem;
  font-weight: bold;
  color: #888;
}

.deathmatch-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  color: #e0d8c0;
  font-size: 0.9rem;
}

.deathmatch-row label {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.countered-hint {
  font-size: 0.8rem;
  color: #e06060;
}

.tactic-rule {
  font-size: 0.8rem;
  color: #888;
  margin: 0;
}

/* ---------- 战前修正 ---------- */
.pre-battle-section {
  margin-bottom: 1.5rem;
  background: #16213e;
  border-radius: 8px;
  padding: 1rem;
  border: 1px solid #2a3a5c;
}

.pre-battle-section h2 {
  margin: 0 0 0.75rem 0;
  font-size: 1.1rem;
  color: #f0c060;
}

.pre-battle-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.pre-battle-row label {
  font-size: 0.85rem;
}

.short {
  width: 80px;
}

/* ---------- 魔力消耗 ---------- */
.mana-section {
  margin-bottom: 1.5rem;
  background: #16213e;
  border-radius: 8px;
  padding: 1rem;
  border: 1px solid #2a3a5c;
}

.mana-section h2 {
  margin: 0 0 0.75rem 0;
  font-size: 1.1rem;
  color: #f0c060;
}

.mana-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.mana-side h3 {
  margin: 0 0 0.5rem 0;
  font-size: 0.95rem;
  color: #c0b080;
}

.mana-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
  font-size: 0.85rem;
}

.mana-name {
  width: 80px;
  color: #80b0e0;
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mana-row label {
  font-size: 0.75rem;
  color: #888;
}

.mana-input {
  width: 60px;
  padding: 0.2rem 0.35rem;
  background: #1a1a2e;
  border: 1px solid #3a4a6c;
  color: #e0d8c0;
  border-radius: 3px;
  font-size: 0.8rem;
}

.mana-remaining {
  font-weight: bold;
  color: #80c080;
  min-width: 70px;
}

.mana-remaining.danger {
  color: #e06060;
}

.mana-penalty {
  font-size: 0.75rem;
  color: #e08040;
}

/* ---------- 属性结算 ---------- */
.settlement-section {
  margin-bottom: 1.5rem;
  background: #16213e;
  border-radius: 8px;
  padding: 1rem;
  border: 1px solid #2a3a5c;
}

.settlement-section h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.1rem;
  color: #f0c060;
}

.compare-config {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.compare-config label {
  font-size: 0.85rem;
}

.compare-select {
  padding: 0.3rem 0.5rem;
  background: #1a1a2e;
  border: 1px solid #3a4a6c;
  color: #e0d8c0;
  border-radius: 3px;
  font-size: 0.85rem;
}

.compare-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
}

.compare-table th,
.compare-table td {
  padding: 0.4rem 0.6rem;
  border: 1px solid #2a3a5c;
  text-align: center;
}

.compare-table th {
  background: #1a1a2e;
  color: #c0b080;
  font-weight: normal;
}

.compare-table .stat-name {
  text-align: left;
  color: #c0b080;
  font-weight: bold;
}

.tag-you {
  color: #80e080;
  font-weight: bold;
}

.tag-lie {
  color: #e08080;
  font-weight: bold;
}

.tag-ping {
  color: #888;
}

.base-rate {
  color: #f0c060;
  font-size: 1.05rem;
}

.correction-row {
  display: flex;
  gap: 2rem;
}

.correction-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.correction-group label {
  font-size: 0.8rem;
  color: #a0a8b8;
}

/* ---------- 最终胜率 ---------- */
.winrate-section {
  margin-bottom: 1.5rem;
  background: #16213e;
  border-radius: 8px;
  padding: 1rem;
  border: 1px solid #2a3a5c;
}

.winrate-section h2 {
  margin: 0 0 0.75rem 0;
  font-size: 1.1rem;
  color: #f0c060;
}

.winrate-grid {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 1.5rem;
}

.winrate-col h3 {
  margin: 0 0 0.5rem 0;
  font-size: 0.95rem;
  color: #c0b080;
}

.winrate-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.winrate-table th,
.winrate-table td {
  padding: 0.35rem 0.5rem;
  border: 1px solid #2a3a5c;
  text-align: center;
}

.winrate-table th {
  background: #1a1a2e;
  color: #c0b080;
  font-weight: normal;
}

.divider-row td {
  border-top: 2px solid #4a5a7c;
  font-weight: bold;
}

.halved-cell {
  color: #f0c060;
  font-weight: bold;
}

.guarantee-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.guarantee-row label {
  font-size: 0.85rem;
  white-space: nowrap;
  width: 70px;
}

.final-result {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 1rem;
  padding: 1rem;
  background: #1a1a2e;
  border-radius: 8px;
  border: 1px solid #3a4a6c;
}

.final-blue,
.final-yellow {
  text-align: center;
  font-size: 0.85rem;
  color: #a0a8b8;
}

.final-num {
  font-size: 2rem;
  font-weight: bold;
}

.final-blue.win .final-num {
  color: #80e080;
}

.final-blue.lose .final-num {
  color: #e08080;
}

.final-yellow.win .final-num {
  color: #e0c860;
}

.final-yellow.lose .final-num {
  color: #e08080;
}

.final-vs {
  font-size: 1.2rem;
  font-weight: bold;
  color: #666;
}

/* ---------- 响应式 ---------- */
@media (max-width: 900px) {
  .formations,
  .mana-grid,
  .winrate-grid {
    grid-template-columns: 1fr;
  }
  .stat-editor {
    grid-template-columns: repeat(2, 1fr);
  }
  .correction-row {
    flex-direction: column;
    gap: 0.5rem;
  }
}
/* ---------- 浅色 Fate 统一主题覆盖 ---------- */
:global(.app-main:has(.battle-sheet-page)) {
  max-width: none;
  padding-left: 1rem;
  padding-right: 1rem;
}

.battle-sheet-page {
  max-width: min(1760px, calc(100vw - 2rem));
  margin: 0 auto;
  padding: 0;
  color: var(--color-text-primary);
  background: transparent;
  min-height: 100vh;
}

.loading {
  color: var(--color-text-secondary);
}

.page-alert {
  border-radius: var(--radius-md);
}

.error-alert {
  border: 1px solid rgba(185, 64, 64, 0.35);
  background: #fff1f1;
  color: #a83232;
}

.warning-alert {
  border: 1px solid rgba(184, 138, 46, 0.35);
  background: #fff7e3;
  color: #8a620f;
}

.sheet-header {
  padding: 1.25rem 1.4rem;
  border: 1px solid var(--color-border);
  border-left: 5px solid var(--color-accent);
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, #ffffff, var(--color-card-soft));
  box-shadow: var(--shadow-md);
}

.sheet-header h1 {
  color: var(--color-primary-dark);
}

.title-row,
.formation-actions,
.campaign-picker,
.battlefield-width-control {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.campaign-picker,
.battlefield-width-control {
  gap: 0.45rem;
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}

.campaign-picker select {
  min-width: 180px;
  padding: 0.35rem 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-primary);
  background: #fff;
}

.campaign-picker select:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(184, 138, 46, 0.12);
}

.formation-actions {
  justify-content: flex-end;
}

.battlefield-width-control .field-input {
  width: 88px;
}

.btn-save,
.btn-confirm {
  border: none;
  border-radius: 999px;
  color: #fff;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
}

.btn-save:hover,
.btn-confirm:hover {
  background: linear-gradient(135deg, var(--color-secondary), var(--color-primary));
}

.lock-badge {
  border: 1px solid rgba(79, 111, 159, 0.28);
  color: var(--color-primary);
  background: #eef2f8;
}

.save-msg {
  color: #1e7d4f;
}

.side,
.stat-table-section,
.skills-section,
.tactics-section,
.pre-battle-section,
.mana-section,
.settlement-section,
.winrate-section,
.template-summary {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: #fff;
  box-shadow: var(--shadow-md);
}

.side h2,
.stat-table-section h2,
.skills-section h2,
.tactics-section h2,
.pre-battle-section h2,
.mana-section h2,
.settlement-section h2,
.winrate-section h2 {
  color: var(--color-primary-dark);
}

.blue-side h2 { color: #315f9c; }
.yellow-side h2 { color: #a97816; }

.field-row label,
.pre-battle-row label,
.compare-config label,
.correction-group label,
.guarantee-row label,
.mana-row label,
.stat-cell label,
.pos-label,
.hint,
.empty-hint,
.tactic-rule,
.tactic-vs,
.tag-ping,
.skill-source,
.final-blue,
.final-yellow {
  color: var(--color-text-secondary);
}

.field-input,
.pos-select,
.mode-select,
.name-input,
.stat-input,
.mana-input,
.compare-select,
.tactic-group select {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  color: var(--color-text-primary);
  background: #fff;
}

.field-input:focus,
.pos-select:focus,
.mode-select:focus,
.name-input:focus,
.stat-input:focus,
.mana-input:focus,
.compare-select:focus,
.tactic-group select:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(184, 138, 46, 0.12);
}

.btn-edit-stats,
.btn-mode-switch {
  border: 1px solid var(--color-primary);
  border-radius: 999px;
  color: var(--color-primary);
  background: #fff;
}

.stat-editor {
  border: 1px dashed rgba(184, 138, 46, 0.35);
  background: #fffaf0;
}

.pos-card-name,
.mana-name {
  color: var(--color-secondary);
}

.stat-table,
.compare-table,
.winrate-table {
  background: #fff;
}

.stat-table th,
.compare-table th,
.winrate-table th {
  color: #fff;
  background: var(--color-primary);
  font-weight: 600;
}

.stat-table td,
.compare-table td,
.winrate-table td {
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
}

.stat-table .stat-name,
.compare-table .stat-name,
.winrate-col h3,
.mana-side h3 {
  color: var(--color-primary-dark);
}

.total-col,
.base-rate,
.halved-cell,
.template-summary h3,
.summary-line strong {
  color: var(--color-accent);
}

.advantage,
.tag-you,
.mana-remaining,
.final-blue.win .final-num {
  color: #1e7d4f;
  font-weight: 700;
}

.disadvantage,
.tag-lie,
.mana-remaining.danger,
.mana-penalty,
.countered-hint,
.final-blue.lose .final-num,
.final-yellow.lose .final-num {
  color: #b73535;
  font-weight: 700;
}

.skill-checkbox {
  border: 1px solid var(--color-border);
  background: #fff;
}

.skill-checkbox:hover {
  border-color: var(--color-accent);
}

.skill-checkbox.checked {
  border-color: #1e7d4f;
  background: #f0fbf5;
}

.skill-checkbox.matched {
  border-color: var(--color-accent);
}

.skill-name {
  color: var(--color-primary-dark);
}

.skill-rank,
.skill-effect,
.skill-raw-text summary {
  color: var(--color-accent);
}

.manual-badge {
  color: #9a2f2f;
  background: #fff1f1;
}

.condition-list,
.skill-raw-text {
  color: var(--color-text-secondary);
}

.skill-raw-text pre {
  background: #f8f5ec;
}

.template-hit {
  color: #5c410b;
  background: var(--color-accent-soft);
}

.template-miss {
  color: var(--color-text-secondary);
  background: #eef2f8;
}

.template-summary {
  border-color: rgba(184, 138, 46, 0.35);
  background: #fffaf0;
}

.summary-line,
.template-summary ul {
  color: var(--color-text-secondary);
}

.tactic-group select.countered {
  border-color: #b73535;
  color: #b73535;
}

.divider-row td {
  border-top: 2px solid var(--color-accent);
}

.final-result {
  border: 1px solid var(--color-border);
  background: var(--color-card-soft);
}

.final-yellow.win .final-num {
  color: #a97816;
}

.final-vs {
  color: var(--color-text-secondary);
}


.phase-flow-top {
  margin-top: 1rem;
}

.phase-flow-top :deep(.phase-nav) {
  position: static;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  width: 100%;
}

.phase-flow-top :deep(.phase-nav button) {
  flex: 1 1 120px;
  min-width: 110px;
}

.phase-board-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
  margin-top: 1rem;
}

.phase-board-main {
  display: grid;
  gap: 1rem;
  min-width: 0;
}

.phase-board-side,
.phase-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: #fff;
  box-shadow: var(--shadow-md);
}

.phase-content-layout {
  display: grid;
  grid-template-columns: minmax(900px, 1fr) minmax(340px, 420px);
  gap: 1rem;
  align-items: start;
}

.phase-content-primary {
  min-width: 0;
}

.phase-board-side {
  display: grid;
  gap: 1rem;
  align-items: start;
  padding: 1rem;
  position: sticky;
  top: 1rem;
}

.phase-summary-top :deep(.skill-impact-preview),
.phase-summary-top :deep(.battle-summary-panel) {
  min-width: 0;
}

.phase-summary-top :deep(.side-summary-block) {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
}

.phase-summary-top :deep(ul) {
  max-height: 5.5rem;
  overflow: auto;
}

.review-history-panel {
  display: grid;
  gap: 0.75rem;
  min-width: 0;
  padding-top: 0.75rem;
  border-top: 1px solid var(--color-border);
}

.review-history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.review-history-header h3 {
  margin: 0;
  color: var(--color-primary-dark);
  font-size: 0.95rem;
}

.btn-mini {
  padding: 0.25rem 0.55rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: #f6f0df;
  color: var(--color-primary-dark);
  cursor: pointer;
  font-size: 0.78rem;
}

.btn-mini:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.review-list {
  display: grid;
  gap: 0.45rem;
  max-height: 10rem;
  overflow: auto;
}

.review-item {
  display: grid;
  gap: 0.2rem;
  width: 100%;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: #fbf8ef;
  color: var(--color-text-primary);
  text-align: left;
  cursor: pointer;
}

.review-item.active {
  border-color: var(--color-accent);
  background: #fff6d8;
}

.review-item span {
  font-weight: 700;
  font-size: 0.82rem;
}

.review-item small {
  color: var(--color-text-secondary);
  font-size: 0.72rem;
}

.review-summary {
  max-height: 16rem;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: #1d2330;
  color: #f3ead4;
  font-size: 0.78rem;
  line-height: 1.5;
}

@media (max-width: 1350px) {
  .phase-content-layout {
    grid-template-columns: 1fr;
  }

  .phase-board-side {
    position: static;
  }
}

.phase-card {
  padding: 1rem;
}

.phase-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
}

.phase-card-header h2,
.phase-board-side h2,
.side-summary-block h3 {
  margin: 0;
  color: var(--color-primary-dark);
}

.phase-stack {
  display: grid;
  gap: 1rem;
  margin-top: 1rem;
}

.result-confirm {
  white-space: nowrap;
}

.side-summary-line {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.55rem 0;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: 0.88rem;
}

.side-summary-line strong {
  color: var(--color-accent);
}

.side-summary-block {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}

.side-summary-block h3 {
  font-size: 0.95rem;
  margin-bottom: 0.5rem;
}

.side-summary-block ul {
  margin: 0.5rem 0 0;
  padding-left: 1.1rem;
  color: var(--color-text-secondary);
  font-size: 0.8rem;
  line-height: 1.45;
}

.warning-block li {
  color: #b73535;
}

@media (max-width: 1100px) {
  .phase-board-layout {
    grid-template-columns: 1fr;
  }
  .phase-board-side {
    position: static;
    max-height: none;
  }
}

@media (max-width: 900px) {
  .phase-card-header {
    flex-direction: column;
  }
}


</style>
