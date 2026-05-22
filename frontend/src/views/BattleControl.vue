<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePersistedRef } from '../composables/usePersistedRef'
import { useAutoSave } from '../composables/useAutoSave'
import { useCampaignManager } from '../composables/useCampaignManager'
import { useCharacterCards } from '../composables/useCharacterCards'
import { useActionOrder } from '../composables/useActionOrder'
import { useLeylineManager } from '../composables/useLeylineManager'
import { useCharacterStatus } from '../composables/useCharacterStatus'
import { useRoundManager } from '../composables/useRoundManager'
import { useActionHistory } from '../composables/useActionHistory'
import { useSSEConnection } from '../composables/useSSEConnection'
import { useDataConsistency } from '../composables/useDataConsistency'
import { normalizeClassName, safeNullArray } from '../utils/helpers.js'
import { getCurrentRound } from '../services/round'

const route = useRoute()
const router = useRouter()

// ========== 共享状态（多个 composable 之间共用）==========
const roundInfo = ref({
  classes: ['弓', '枪', '骑', '剑', '杀', '术', '狂'],
  servantNames: ['', '', '', '', '', '', ''],
  masterNames: ['', '', '', '', '', '', ''],
  servantMana: [0, 0, 0, 0, 0, 0, 0],
  masterMana: [0, 0, 0, 0, 0, 0, 0],
  commandSeals: [3, 3, 3, 3, 3, 3, 3],
  statusEffects: [[], [], [], [], [], [], []],
})

const currentTurn = usePersistedRef('battle-ctrl:currentTurn', 1)
const totalTurns = ref(29)

const collapsedSections = usePersistedRef('battle-ctrl:collapsed', {
  leylineSummary: false,
  leylineMgmt: true,
  roundInfo: false,
  actionOrder: true,
  actionRecords: true,
})

// 灵脉指派 —— 在各 composable 间共享
const servantLeylineIds = ref(safeNullArray(roundInfo.value.classes.length))
const masterLeylineIds = ref(safeNullArray(roundInfo.value.classes.length))

// ========== 自动保存 ==========
const autoSave = useAutoSave()
const { scheduleAutoSave, saveIndicators, cancelScheduled, cancelAll } = autoSave

// ========== 战役管理 ==========
const campaignMgr = useCampaignManager(route, router)
const {
  campaigns, loading, searchQuery, selectedCampaigns,
  showCreateDialog, showDeleteDialog, newCampaignName, newCampaignDescription,
  selectAll, campaignId, campaignName,
  filteredCampaigns, stats,
  handleDeleteCampaigns, toggleSelectAll, toggleSelect,
  goToCharacterCardUpload,
  handleCreateCampaign: _handleCreateCampaign,
  selectCampaign: _selectCampaign,
  loadCampaigns: _loadCampaigns,
} = campaignMgr

// ========== 角色卡 ==========
const charCards = useCharacterCards(campaignId, roundInfo, currentTurn, servantLeylineIds, masterLeylineIds)
const {
  characterCards, characterStatuses,
  servantCodes, masterCodes,
  holyGrailScale, holyGrailTier,
  getCardBySlot, loadCharacterCards, loadCharacterStatuses, resetRoundInfoToDefaults,
  retireCharacter: _retireCharacter,
  resummonCharacter: _resummonCharacter,
} = charCards

// ========== 行动顺序 & 行动提交 ==========
const actionOrderMod = useActionOrder(campaignId, roundInfo)
const {
  actionOrder, servantActions, masterActions,
  servantActionPhases, masterActionPhases,
  resetActionOrderActions,
  loadActionSubmissions: _loadActionSubmissions,
} = actionOrderMod

// ========== 灵脉管理 ==========
const leyMgr = useLeylineManager(
  campaignId, characterCards, roundInfo,
  servantCodes, masterCodes, servantActions, masterActions,
  servantLeylineIds, masterLeylineIds,
)
const {
  leylines, selectedLeyline, leyLoading, assignmentSaving,
  loadLeylines, getCharactersOnLeyline, getSubmissionsOnLeyline,
  assignCharacterToLeyline, saveAllAssignments,
  addLeyline, saveLeyline, removeLeyline,
} = leyMgr

// ========== 角色状态（魔力/令咒/异常状态自动保存）==========
const charStatus = useCharacterStatus(
  campaignId, roundInfo, characterCards, currentTurn,
  characterStatuses, servantLeylineIds, masterLeylineIds,
  { scheduleAutoSave, saveIndicators, cancelScheduled },
)
const {
  getSelectedStatusEffects, addStatusEffect, getAvailableStatusEffects,
  adjustStatusEffectLevel, removeStatusEffect,
  updateCharacterMana, updateCommandSeals,
  // 以下函数被模板直接引用，需要从 useCharacterStatus 重新导出到顶层
  formatStatusEffectDisplay, STATUS_EFFECTS,
  getStatusType, getStatusTypeDisplayName,
} = charStatus

// ========== 回合管理 ==========
const roundMgr = useRoundManager(
  campaignId, roundInfo, currentTurn, totalTurns,
  characterStatuses, actionOrder, servantActions, masterActions,
  { loadCharacterStatuses, resetActionOrderActions },
)
const {
  historyActions, currentTurnLabel, progressPercent,
  loadHistory, closeActions, nextTurn,
} = roundMgr

// ========== 行动历史 ==========
const actionHist = useActionHistory(historyActions, currentTurn)
const {
  actionRecordHeaderClasses, actionRecordRowLabels,
  getHistoryServantForRound, getHistoryMasterForRound,
} = actionHist

// ========== 辅助函数 ==========

/**
 * 根据从者阶职查找其在 roundInfo.classes 中的槽位索引
 * 在 orchestrator 中定义以便 loadActionSubmissions 和 SSE 共用
 */
function findSlotIndexFromServantClass(servantClass) {
  if (!servantClass) return -1
  // 1) 标准化后直接匹配
  const norm = normalizeClassName(servantClass)
  let idx = roundInfo.value.classes.indexOf(norm)
  if (idx !== -1) return idx

  const text = String(servantClass).toLowerCase()
  // 2) 通过角色卡 className 模糊匹配
  for (let i = 0; i < roundInfo.value.classes.length; i++) {
    const cls = roundInfo.value.classes[i]
    const card = characterCards.value.find(
      c => normalizeClassName(c.className) === cls &&
        String(c.className || '').toLowerCase().includes(text),
    )
    if (card) return i
  }
  // 3) 通过角色代号(code)精确匹配
  for (let i = 0; i < roundInfo.value.classes.length; i++) {
    const card = characterCards.value.find(
      c => String(c.code || '').toLowerCase() === text,
    )
    if (card) {
      const cls = normalizeClassName(card.className)
      const idx2 = roundInfo.value.classes.indexOf(cls)
      if (idx2 !== -1) return idx2
    }
  }
  return -1
}

// ========== 包装：loadActionSubmissions（零参数版本，供模板 @click 使用）==========
async function loadActionSubmissions() {
  await _loadActionSubmissions(currentTurn, normalizeClassName, characterCards, findSlotIndexFromServantClass)
}

// ========== SSE 长连接 ==========
const sseMod = useSSEConnection(
  campaignId, servantActions, masterActions,
  servantActionPhases, masterActionPhases,
  roundInfo, characterCards,
  loadActionSubmissions,
)
const { connectActionSSE } = sseMod

// ========== 数据一致性 ==========
const dataConsistency = useDataConsistency(campaignId, {
  loadCharacterCards, loadLeylines, loadActionSubmissions,
  loadCharacterStatuses, resetRoundInfoToDefaults,
})
const { ensureDataConsistency } = dataConsistency

// ========== 契约状态（内联在回合信息表中） ==========
// 6种契约类型（规则书第四章）
const CONTRACT_TYPES = [
  { value: 'SAINT_GRAIL', label: '圣杯契约' },
  { value: 'ALLIANCE', label: '同盟契约' },
  { value: 'NON_AGGRESSION', label: '不战契约' },
  { value: 'MANA', label: '魔力契约' },
  { value: 'FORCED', label: '强制契约' },
  { value: 'ENSLAVEMENT', label: '奴役契约' },
]
// 当前战役的全部ACTIVE契约（用于显示和双向查找）
const activeContracts = ref([])
// 每个槽位当前编辑中的：{ contractType, targetCardId }
const contractEditState = ref(safeNullArray(roundInfo.value.classes.length))
const contractSaving = ref(false)

import { listContracts, createContract, breakContract } from '../services/contract.js'

/** 加载契约 */
async function loadContracts() {
  if (!campaignId.value) { activeContracts.value = []; return }
  try {
    const list = await listContracts(campaignId.value) || []
    activeContracts.value = list.filter(c => c.status === 'ACTIVE')
  } catch (e) {
    console.error('加载契约失败:', e)
  }
}

/** 查找角色卡所在槽位索引 */
function findSlotByCardId(cardId) {
  if (!cardId) return -1
  const card = characterCards.value.find(c => c.id === cardId)
  if (!card) return -1
  if (card.cardType === 'SERVANT') return findSlotIndexFromServantClass(card.className)
  // MASTER: 通过代号匹配
  const code = (card.code || '').toLowerCase()
  if (!code) return -1
  return masterCodes.value.findIndex(c => (c || '').toLowerCase() === code)
}

/** 获取某槽位涉及的全部契约（用于显示标签） */
function getContractsForSlot(slotIndex) {
  const servantCard = getCardBySlot(slotIndex, 'SERVANT')
  const masterCard = getCardBySlot(slotIndex, 'MASTER')
  const ids = new Set([servantCard?.id, masterCard?.id].filter(Boolean))
  return activeContracts.value.filter(ct =>
    ids.has(ct.initiatorCardId) || ids.has(ct.signatoryCardId)
  )
}

/** 获取角色卡代号（简短显示） */
function getCardCode(cardId) {
  if (!cardId) return '?'
  const card = characterCards.value.find(c => c.id === cardId)
  return card?.code || '#' + cardId
}

/** 契约类型变更时，自动设置立约人默认值 */
function onContractTypeSelected(slotIndex) {
  const st = contractEditState.value[slotIndex]
  if (!st) return
  // 默认立约人：优先御主，没有御主则从者
  if (getCardBySlot(slotIndex, 'MASTER')) {
    st.initiatorType = 'MASTER'
  } else if (getCardBySlot(slotIndex, 'SERVANT')) {
    st.initiatorType = 'SERVANT'
  }
  st.targetCardId = null
}

/** GM设置契约时调用 */
async function handleContractChange(slotIndex) {
  const st = contractEditState.value[slotIndex]
  if (!st?.contractType || !st?.targetCardId || !st?.initiatorType) return
  if (!campaignId.value) return

  // 立约人：按GM选择的类型（御主/从者）
  const initiator = getCardBySlot(slotIndex, st.initiatorType)
  if (!initiator?.id) return

  contractSaving.value = true
  try {
    await createContract(campaignId.value, st.contractType, initiator.id, st.targetCardId, null)
    contractEditState.value[slotIndex] = null
    await loadContracts()
  } catch (e) {
    console.error('创建契约失败:', e)
    await loadContracts()
  } finally {
    contractSaving.value = false
  }
}

/** 破除契约 */
async function handleBreakContractById(contractId) {
  if (!confirm('确定破除该契约？')) return
  try {
    await breakContract(contractId)
    await loadContracts()
  } catch (e) {
    console.error('破除契约失败:', e)
  }
}

// ========== 包装函数（桥接 composable 与模板）==========

// selectCampaign：composable 版只做基础切换 + router.push，这里补充数据加载
async function selectCampaign(campaign) {
  await _selectCampaign(campaign)
  await loadCharacterCards()
  await loadLeylines()
  await loadContracts()
  try {
    const r = await getCurrentRound(campaignId.value)
    if (r && r.round && r.round.turnNumber != null) {
      currentTurn.value = Number(r.round.turnNumber)
    }
  } catch (e) { console.error('获取当前回合失败', e) }
  try { await loadHistory() } catch (e) { console.error('加载历史记录失败', e) }
  connectActionSSE()
}

// handleCreateCampaign：创建后自动加载新战役的数据
async function handleCreateCampaign() {
  await _handleCreateCampaign()
  if (campaignId.value) {
    await loadCharacterCards()
    await loadLeylines()
    await loadContracts()
    await loadHistory()
    connectActionSSE()
  }
}

// retireCharacter / resummonCharacter：composable 版需要第3个参数 loadLeylines
async function retireCharacter(slotIndex, type) {
  await _retireCharacter(slotIndex, type, loadLeylines)
}
async function resummonCharacter(slotIndex, type) {
  await _resummonCharacter(slotIndex, type, loadLeylines)
}

// ========== onCampaignReady 回调（传给 loadCampaigns）==========
async function onCampaignReady(cid) {
  await loadCharacterCards()
  await loadLeylines()
  await loadContracts()
  try {
    const r = await getCurrentRound(cid)
    if (r && r.round && r.round.turnNumber != null) {
      currentTurn.value = Number(r.round.turnNumber)
    }
  } catch (e) { console.error('获取当前回合失败', e) }
  try { await loadHistory() } catch (e) { console.error('加载历史记录失败', e) }
  connectActionSSE()
}

// ========== 生命周期 ==========
onMounted(async () => {
  await _loadCampaigns(onCampaignReady)
  await loadActionSubmissions()
  if (campaignId.value) {
    await ensureDataConsistency()
  }
})

onBeforeUnmount(() => {
  cancelAll()
})
</script>
<template>
  <section class="battle-control">
    <div class="battle-layout">
      <!-- ========== 侧边栏：搜索 + 战役列表 ========== -->
      <aside class="sidebar">
        <h1 class="sidebar-title">战役管理</h1>

      <!-- 搜索和创建 -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">搜索和筛选</h2>
        </div>
        <div class="card-body">
          <div class="search-create-bar">
            <input
              v-model="searchQuery"
              type="text"
              class="search-input"
              placeholder="搜索战役名称或描述..."
            />
            <button class="btn btn-primary" @click="showCreateDialog = true">
              <span>+</span> 创建战役
            </button>
          </div>
        </div>
      </div>

      <!-- 战役列表 -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">所有战役</h2>
          <button 
            v-if="selectedCampaigns.size > 0"
            class="btn btn-danger btn-sm"
            @click="showDeleteDialog = true"
          >
            删除选中 ({{ selectedCampaigns.size }})
          </button>
        </div>
        <div class="card-body">
          <div v-if="loading" class="loading">加载中...</div>
          <div v-else-if="filteredCampaigns.length === 0" class="empty-state">
            没有找到战役
          </div>
          <div v-else class="table-container">
            <table>
              <thead>
                <tr>
                  <th>
                    <input 
                      type="checkbox" 
                      :checked="selectAll"
                      @change="toggleSelectAll"
                    />
                  </th>
                  <th>名称</th>
                  <th>描述</th>
                  <th>创建时间</th>
                  <th class="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr 
                  v-for="campaign in filteredCampaigns" 
                  :key="campaign.id"
                  :class="{ 'active-campaign': campaignId === campaign.id }"
                >
                  <td>
                    <input 
                      type="checkbox" 
                      :checked="selectedCampaigns.has(campaign.id)"
                      @change="toggleSelect(campaign.id)"
                    />
                  </td>
                  <td class="font-medium">{{ campaign.name }}</td>
                  <td class="text-secondary">{{ campaign.description || '-' }}</td>
                  <td class="text-secondary">
                    {{ campaign.createdAt ? new Date(campaign.createdAt).toLocaleDateString('zh-CN') : '-' }}
                  </td>
                  <td class="text-right">
                    <div class="action-buttons">
                      <button 
                        class="btn btn-sm"
                        :class="campaignId === campaign.id ? 'btn-primary' : 'btn-secondary'"
                        @click="selectCampaign(campaign)"
                      >
                        {{ campaignId === campaign.id ? '当前战役' : '选择' }}
                      </button>
                      <button 
                        class="btn btn-sm btn-secondary"
                        @click="goToCharacterCardUpload(campaign.id)"
                      >
                        人物卡
                      </button>
                      <button 
                        class="btn btn-sm btn-danger" 
                        @click="selectedCampaigns.add(campaign.id); showDeleteDialog = true"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="card-footer">
          <div class="text-sm text-secondary">
            显示 {{ filteredCampaigns.length }} 个战役（共 {{ campaigns.length }} 个）
          </div>
        </div>
      </div>
      </aside>

      <!-- ========== 主内容区 ========== -->
      <main class="main-content">
        <div v-if="campaignId" class="battle-control-section">
      <!-- 1. 圣杯战争战役控制界面（整合：信息 + 进度条 + 控制按钮） -->
      <section class="card top-control-card">
        <div class="card-body" style="text-align:center;">
          <h2 class="section-title">圣杯战争战役控制界面</h2>
          <p class="campaign-info">
            战役ID：{{ campaignId }} ｜
            战役名称：{{ campaignName || '未选择战役' }} ｜
            当前回合：{{ currentTurnLabel }}（第{{ currentTurn }}回合） ｜
            圣杯规模：{{ holyGrailScale }} （{{ holyGrailTier }}）
            <small><i>（每个从者退场 +1；每2个御主退场 +1）</i></small>
          </p>

          <!-- 战役进度条 -->
          <div class="progress-bar-wrapper">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: progressPercent + '%' }">
                <span class="progress-text">{{ progressPercent }}%</span>
              </div>
            </div>
            <div class="progress-info">
              <span>第{{ currentTurn }}回合 / 共{{ totalTurns }}回合（降临日 + 14天，每天2回合）</span>
              <span>已完成：{{ progressPercent }}%</span>
            </div>
          </div>

          <!-- 控制按钮 -->
          <div class="control-actions">
            <button class="btn btn-warning" @click="closeActions">关闭行动提交</button>
            <button class="btn btn-primary" @click="nextTurn">进入下一回合</button>
          </div>
        </div>
      </section>

      <!-- 当前回合信息表 -->
      <div class="table-container">
        <div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;" @click="collapsedSections.roundInfo = !collapsedSections.roundInfo">
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <span class="collapse-arrow">{{ collapsedSections.roundInfo ? '▶' : '▼' }}</span>
            <h2 style="margin:0;">当前回合信息表</h2>
          </div>
          <div @click.stop>
          </div>
        </div>
        <div class="table-wrapper" v-show="!collapsedSections.roundInfo">
          <table class="holy-grail-table">
            <thead>
              <tr>
                <th>字段</th>
                <th v-for="(cls, index) in roundInfo.classes" :key="index">{{ cls }}</th>
              </tr>
            </thead>
            <tbody>
              <tr class="master-row">
                <td>阶职</td>
                <td v-for="(cls, index) in roundInfo.classes" :key="index">{{ cls }}</td>
              </tr>
              <tr class="servant-row">
                <td>从者代号</td>
                <td v-for="(code, index) in servantCodes" :key="`s-code-${index}`">
                  <span>{{ code || '-' }}</span>
                  <template v-if="code">
                    <button
                      v-if="!getCardBySlot(index, 'SERVANT')?.retired"
                      class="retire-btn"
                      title="退场"
                      @click="retireCharacter(index, 'SERVANT')"
                    >✕</button>
                    <button
                      v-else
                      class="resummon-btn"
                      title="返场"
                      @click="resummonCharacter(index, 'SERVANT')"
                    >返场</button>
                  </template>
                </td>
              </tr>
              <tr class="master-row">
                <td>御主代号</td>
                <td v-for="(code, index) in masterCodes" :key="`m-code-${index}`">
                  <span>{{ code || '-' }}</span>
                  <template v-if="code">
                    <button
                      v-if="!getCardBySlot(index, 'MASTER')?.retired"
                      class="retire-btn"
                      title="退场"
                      @click="retireCharacter(index, 'MASTER')"
                    >✕</button>
                    <button
                      v-else
                      class="resummon-btn"
                      title="返场"
                      @click="resummonCharacter(index, 'MASTER')"
                    >返场</button>
                  </template>
                </td>
              </tr>
            <tr class="action-row">
              <td>从者提交</td>
              <td v-for="(act, index) in servantActions" :key="`s-action-${index}`">{{ act || '-' }}</td>
            </tr>
            <tr class="action-row">
              <td>御主提交</td>
              <td v-for="(act, index) in masterActions" :key="`m-action-${index}`">{{ act || '-' }}</td>
            </tr>
              <tr class="servant-row">
                <td>从者所在灵脉</td>
                <td v-for="(cls, index) in roundInfo.classes" :key="`s-leyline-${index}`">
                  <select v-model.number="servantLeylineIds[index]" class="leyline-select" @change="() => assignCharacterToLeyline(index, 'SERVANT')">
                    <option :value="null">无</option>
                    <option v-for="ley in leylines" :key="ley.id" :value="ley.id">
                      {{ ley.name }}
                    </option>
                  </select>
                </td>
              </tr>
              <tr class="master-row">
                <td>御主所在灵脉</td>
                <td v-for="(cls, index) in roundInfo.classes" :key="`m-leyline-${index}`">
                  <select v-model.number="masterLeylineIds[index]" class="leyline-select" @change="() => assignCharacterToLeyline(index, 'MASTER')">
                    <option :value="null">无</option>
                    <option v-for="ley in leylines" :key="ley.id" :value="ley.id">
                      {{ ley.name }}
                    </option>
                  </select>
                </td>
              </tr>
              <tr class="status-row">
                <td>异常状态</td>
                <td v-for="(cls, index) in roundInfo.classes" :key="`status-effects-${index}`">
                  <div class="status-effects-container">
                    <!-- 异常状态选择器 -->
                    <div class="status-effect-selector">
                      <select
                        class="status-effect-dropdown"
                        @change="addStatusEffect(index, $event.target.value); $event.target.value = ''"
                        :disabled="!getCardBySlot(index, 'SERVANT') && !getCardBySlot(index, 'MASTER')"
                      >
                        <option value="">添加异常状态...</option>
                        <optgroup label="强化状态">
                          <option v-for="effect in getAvailableStatusEffects(index, STATUS_EFFECTS.BUFF)" :key="`buff-${effect}`" :value="effect">
                            {{ effect }}
                          </option>
                        </optgroup>
                        <optgroup label="弱化状态">
                          <option v-for="effect in getAvailableStatusEffects(index, STATUS_EFFECTS.DEBUFF)" :key="`debuff-${effect}`" :value="effect">
                            {{ effect }}
                          </option>
                        </optgroup>
                        <optgroup label="异常状态">
                          <option v-for="effect in getAvailableStatusEffects(index, STATUS_EFFECTS.ABNORMAL)" :key="`abnormal-${effect}`" :value="effect">
                            {{ effect }}
                          </option>
                        </optgroup>
                      </select>
                    </div>

                    <!-- 已选择的异常状态显示 -->
                    <div class="status-effects-display">
                      <div class="input-with-indicator">
                        <div class="status-effects-list">
                          <div v-for="effect in roundInfo.statusEffects[index]" :key="effect.name" class="status-effect-tag">
                            <span class="effect-name">{{ formatStatusEffectDisplay(effect) }}</span>
                            <div class="effect-controls">
                              <button class="level-btn" @click="adjustStatusEffectLevel(index, effect.name, -1)">-</button>
                              <span class="level-display">{{ effect.level }}</span>
                              <button class="level-btn" @click="adjustStatusEffectLevel(index, effect.name, 1)">+</button>
                              <button class="remove-btn" @click="removeStatusEffect(index, effect.name)">×</button>
                            </div>
                          </div>
                        </div>
                        <div class="save-indicator" v-if="saveIndicators[`status-effects-${index}`]">
                          <span class="indicator-icon" :class="saveIndicators[`status-effects-${index}`]">
                            {{ saveIndicators[`status-effects-${index}`] === 'saving' ? '⏳' : saveIndicators[`status-effects-${index}`] === 'saved' ? '✓' : '✗' }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
              <tr class="mana-row">
              <td>当前从者魔力</td>
              <td
                v-for="(mana, index) in roundInfo.servantMana"
                :key="`servant-mana-${index}`"
                :class="mana < 0 ? 'low-mana' : 'normal-mana'"
              >
                <div class="input-with-indicator">
                  <input
                    type="number"
                    :value="mana"
                    @input="updateCharacterMana(index, 'SERVANT', $event.target.value)"
                    @blur="updateCharacterMana(index, 'SERVANT', $event.target.value, true)"
                    @keyup.enter="updateCharacterMana(index, 'SERVANT', $event.target.value, true)"
                    class="mana-input"
                    :class="{ 'saving': saveIndicators[`SERVANT-mana-${index}`] === 'saving', 'saved': saveIndicators[`SERVANT-mana-${index}`] === 'saved', 'error': saveIndicators[`SERVANT-mana-${index}`] === 'error' }"
                    :disabled="!getCardBySlot(index, 'SERVANT')"
                  />
                  <div class="save-indicator" v-if="saveIndicators[`SERVANT-mana-${index}`]">
                    <span class="indicator-icon" :class="saveIndicators[`SERVANT-mana-${index}`]">
                      {{ saveIndicators[`SERVANT-mana-${index}`] === 'saving' ? '⏳' : saveIndicators[`SERVANT-mana-${index}`] === 'saved' ? '✓' : '✗' }}
                    </span>
                  </div>
                </div>
              </td>
            </tr>
            <tr class="mana-row">
              <td>当前御主魔力</td>
              <td
                v-for="(mana, index) in roundInfo.masterMana"
                :key="`master-mana-${index}`"
              >
                <div class="input-with-indicator">
                  <input
                    type="number"
                    :value="mana"
                    @input="updateCharacterMana(index, 'MASTER', $event.target.value)"
                    @blur="updateCharacterMana(index, 'MASTER', $event.target.value, true)"
                    @keyup.enter="updateCharacterMana(index, 'MASTER', $event.target.value, true)"
                    class="mana-input"
                    :class="{ 'saving': saveIndicators[`MASTER-mana-${index}`] === 'saving', 'saved': saveIndicators[`MASTER-mana-${index}`] === 'saved', 'error': saveIndicators[`MASTER-mana-${index}`] === 'error' }"
                    :disabled="!getCardBySlot(index, 'MASTER')"
                  />
                  <div class="save-indicator" v-if="saveIndicators[`MASTER-mana-${index}`]">
                    <span class="indicator-icon" :class="saveIndicators[`MASTER-mana-${index}`]">
                      {{ saveIndicators[`MASTER-mana-${index}`] === 'saving' ? '⏳' : saveIndicators[`MASTER-mana-${index}`] === 'saved' ? '✓' : '✗' }}
                    </span>
                  </div>
                </div>
              </td>
            </tr>
              <tr class="status-row">
                <td>当前令咒</td>
                <td v-for="(seal, index) in roundInfo.commandSeals" :key="`command-seals-${index}`">
                  <div class="command-seals-container">
                    <div class="input-with-indicator">
                      <input
                        type="number"
                        :value="seal"
                        @input="updateCommandSeals(index, $event.target.value)"
                        @blur="updateCommandSeals(index, $event.target.value, true)"
                        @keyup.enter="updateCommandSeals(index, $event.target.value, true)"
                        class="command-seals-input"
                        :class="{ 'saving': saveIndicators[`command-seals-${index}`] === 'saving', 'saved': saveIndicators[`command-seals-${index}`] === 'saved', 'error': saveIndicators[`command-seals-${index}`] === 'error' }"
                        min="0"
                        max="3"
                        :disabled="!getCardBySlot(index, 'MASTER')"
                      />
                      <div class="save-indicator" v-if="saveIndicators[`command-seals-${index}`]">
                        <span class="indicator-icon" :class="saveIndicators[`command-seals-${index}`]">
                          {{ saveIndicators[`command-seals-${index}`] === 'saving' ? '⏳' : saveIndicators[`command-seals-${index}`] === 'saved' ? '✓' : '✗' }}
                        </span>
                      </div>
                    </div>
                    <div class="command-seals-display">
                      <span
                        v-for="i in 3"
                        :key="i"
                        :class="i <= seal ? 'seal' : 'seal-used'"
                      ></span>
                    </div>
                  </div>
                </td>
              </tr>
              <tr class="master-row">
                <td>契约</td>
                <td v-for="(cls, index) in roundInfo.classes" :key="`contract-${index}`">
                  <div class="contract-cell">
                    <!-- 已生效的契约标签（双向显示：双方都能看到相同的主→从关系） -->
                    <div class="contract-tags">
                      <div
                        v-for="ct in getContractsForSlot(index)"
                        :key="ct.id"
                        class="contract-tag-item"
                      >
                        <span class="contract-tag-type">{{ ct.contractTypeLabel }}</span>
                        <span class="contract-tag-role contract-tag-master">主:{{ getCardCode(ct.initiatorCardId) }}</span>
                        <span class="contract-tag-arrow">→</span>
                        <span class="contract-tag-role contract-tag-servant">从:{{ getCardCode(ct.signatoryCardId) }}</span>
                        <button class="contract-break-btn" title="破除契约" @click="handleBreakContractById(ct.id)">×</button>
                      </div>
                      <span v-if="getContractsForSlot(index).length === 0" class="contract-none">-</span>
                    </div>
                    <!-- 新建契约：类型 → 谁立约 → 对象 三个下拉框 -->
                    <div class="contract-edit">
                      <select
                        v-model="(contractEditState[index] || (contractEditState[index] = {})).contractType"
                        class="contract-type-select"
                        @change="onContractTypeSelected(index)"
                      >
                        <option :value="null">+契约</option>
                        <option v-for="ct in CONTRACT_TYPES" :key="ct.value" :value="ct.value">
                          {{ ct.label }}
                        </option>
                      </select>
                      <!-- 立约人选择：仅当御主和从者都存在时才需要选择 -->
                      <select
                        v-if="contractEditState[index]?.contractType && getCardBySlot(index, 'MASTER') && getCardBySlot(index, 'SERVANT')"
                        v-model="contractEditState[index].initiatorType"
                        class="contract-initiator-select"
                      >
                        <option value="MASTER">御主立约</option>
                        <option value="SERVANT">从者立约</option>
                      </select>
                      <select
                        v-if="contractEditState[index]?.contractType && contractEditState[index]?.initiatorType"
                        v-model="contractEditState[index].targetCardId"
                        class="contract-target-select"
                        @change="handleContractChange(index)"
                        :disabled="contractSaving"
                      >
                        <option :value="null">选择对方...</option>
                        <option
                          v-for="card in characterCards.filter(c => !c.retired && c.id !== (getCardBySlot(index, contractEditState[index].initiatorType))?.id)"
                          :key="card.id"
                          :value="card.id"
                        >
                          {{ card.code || '#' + card.id }}{{ card.className ? '（' + card.className + '）' : '' }}
                        </option>
                      </select>
                      <span v-if="contractSaving" class="contract-saving">⏳</span>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 行动排序表格 -->
      <div class="table-container">
        <h2 class="collapsible-header" @click="collapsedSections.actionOrder = !collapsedSections.actionOrder" style="margin:0;padding:0.5rem 1rem;">
          <span class="collapse-arrow">{{ collapsedSections.actionOrder ? '▶' : '▼' }}</span>
          当前回合行动顺序
        </h2>
        <div class="table-wrapper" v-show="!collapsedSections.actionOrder">
          <table>
            <thead>
              <tr>
                <th>行动类别</th>
                <th v-for="(cls, index) in roundInfo.classes" :key="index">{{ cls }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(action, idx) in actionOrder" :key="idx">
                <td>{{ action.type }}</td>
                <td v-for="(act, index) in action.actions" :key="index">
                  {{ act || '-' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    <!-- 灵脉管理完整面板（从技能记录迁移） -->
      <section class="card" v-if="campaignId">
        <div class="card-header collapsible-header" @click="collapsedSections.leylineMgmt = !collapsedSections.leylineMgmt">
          <span class="collapse-arrow">{{ collapsedSections.leylineMgmt ? '▶' : '▼' }}</span>
          <h2 class="card-title">灵脉管理</h2>
          <div class="card-actions" @click.stop>
            <button class="btn btn-secondary" @click="addLeyline">新建灵脉</button>
          </div>
        </div>
        <div class="card-body leyline-layout" v-show="!collapsedSections.leylineMgmt">
          <div class="leyline-list-panel">
            <div v-if="!campaignId" class="empty-state">
              请选择一个战役后，再添加或编辑灵脉。
            </div>
            <div v-else-if="leyLoading" class="empty-state">
              正在加载灵脉数据...
            </div>
            <div v-else-if="!leylines.length" class="empty-state">
              当前战役尚未配置任何灵脉，点击上方“新建灵脉”开始添加。
            </div>
            <div v-else class="leyline-list">
              <div
                v-for="ley in leylines"
                :key="ley.id ?? ley._tempId"
                class="leyline-item-summary"
                :class="{ active: selectedLeyline && (selectedLeyline.id === ley.id || selectedLeyline._tempId === ley._tempId) }"
                @click="selectedLeyline = ley"
              >
                <div class="leyline-name-row">
                  <span class="leyline-name-text">{{ ley.name || '未命名灵脉' }}</span>
                  <span v-if="ley.sizeLabel" class="leyline-size-badge" :class="'size-' + (ley.size || '').toLowerCase()">{{ ley.sizeLabel }}</span>
                  <span v-if="ley.ownerCode" class="leyline-owner-badge" title="灵脉所有者">{{ ley.ownerCode }}</span>
                </div>
                <div class="leyline-meta">
                  魔力量：{{ ley.manaAmount }} ｜ 战场宽度：{{ ley.battlefieldWidth }} ｜ 人流量：{{ ley.populationFlow }}
                </div>
              </div>
            </div>
          </div>

          <div class="leyline-detail-panel">
            <div v-if="!selectedLeyline" class="empty-state">
              在左侧选择一个灵脉，或点击“新建灵脉”后在此编辑详情。
            </div>
            <div v-else class="leyline-detail">
              <div class="detail-row">
                <label class="detail-label">名称</label>
                <input
                  v-model="selectedLeyline.name"
                  class="detail-input"
                  type="text"
                  placeholder="灵脉名称（例：冬木教会）"
                />
              </div>
              <div class="detail-row three-cols">
                <div class="detail-field">
                  <label class="detail-label">魔力量</label>
                  <input
                    v-model.number="selectedLeyline.manaAmount"
                    type="number"
                    class="detail-input"
                    min="0"
                  />
                </div>
                <div class="detail-field">
                  <label class="detail-label">战场宽度</label>
                  <input
                    v-model.number="selectedLeyline.battlefieldWidth"
                    type="number"
                    class="detail-input"
                    min="0"
                  />
                </div>
                <div class="detail-field">
                  <label class="detail-label">人流量</label>
                  <input
                    v-model.number="selectedLeyline.populationFlow"
                    type="number"
                    class="detail-input"
                    min="0"
                  />
                </div>
              </div>
              <!-- 灵脉大小 + 所有者 -->
              <div class="detail-row two-cols">
                <div class="detail-field">
                  <label class="detail-label">灵脉大小</label>
                  <select v-model="selectedLeyline.size" class="detail-input">
                    <option :value="null">自动（按魔力量）</option>
                    <option value="EMPTY">空灵脉</option>
                    <option value="SMALL">小灵脉（5~10）</option>
                    <option value="MEDIUM">中灵脉（15~30）</option>
                    <option value="LARGE">大灵脉（35+）</option>
                  </select>
                </div>
                <div class="detail-field">
                  <label class="detail-label">灵脉所有者</label>
                  <select v-model="selectedLeyline.ownerCharacterId" class="detail-input">
                    <option :value="null">无</option>
                    <option v-for="card in characterCards.filter(c => !c.retired)" :key="card.id" :value="card.id">
                      {{ card.code || '#' + card.id }}{{ card.className ? '（' + card.className + '）' : '' }}
                    </option>
                  </select>
                </div>
              </div>
              <div class="detail-row">
                <label class="detail-label">效果（可选）</label>
                <textarea
                  v-model="selectedLeyline.effect"
                  class="detail-textarea"
                  rows="3"
                  placeholder="在此描述灵脉效果，例如：提升某些技能等级、影响魔力量恢复。"
                ></textarea>
              </div>
              <div class="detail-row">
                <label class="detail-label">额外描述（可选）</label>
                <textarea
                  v-model="selectedLeyline.description"
                  class="detail-textarea"
                  rows="3"
                  placeholder="在此书写该地点的风味描述或额外说明。"
                ></textarea>
              </div>
              <div class="detail-actions">
                <button class="btn btn-primary" @click="saveLeyline(selectedLeyline)">保存</button>
                <button class="btn btn-danger" @click="removeLeyline(selectedLeyline)">删除</button>
                <button class="btn" @click="addLeyline">新建灵脉</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 灵脉一览（可复制给进行过广泛侦察的玩家） -->
      <div class="leyline-summary-card" v-if="leylines && leylines.length">
        <div class="card">
          <div class="card-header collapsible-header" @click="collapsedSections.leylineSummary = !collapsedSections.leylineSummary">
            <span class="collapse-arrow">{{ collapsedSections.leylineSummary ? '▶' : '▼' }}</span>
            <h2 class="card-title">灵脉一览（侦察用）</h2>
          </div>
          <div class="card-body" v-show="!collapsedSections.leylineSummary">
            <div class="leyline-summary-list">
              <div
                v-for="ley in leylines"
                :key="ley.id"
                class="leyline-summary-item"
              >
                <div class="leyline-summary-name">{{ ley.name }}</div>
                <div class="leyline-summary-meta">
                  魔力量：{{ ley.manaAmount ?? '-' }} ｜
                  战场宽度：{{ ley.battlefieldWidth ?? '-' }} ｜
                  人流量：{{ ley.populationFlow ?? '-' }}
                </div>
                <div class="leyline-summary-characters">
                  <span v-if="getCharactersOnLeyline(ley.id).servants.length || getCharactersOnLeyline(ley.id).masters.length">
                    {{ [...getCharactersOnLeyline(ley.id).servants, ...getCharactersOnLeyline(ley.id).masters].join('、') }}
                  </span>
                  <span v-else>无</span>
                  <div class="leyline-submissions" v-if="getSubmissionsOnLeyline(ley.id).length">
                    <small>提交：</small>
                    <div v-for="(s, i) in getSubmissionsOnLeyline(ley.id)" :key="`sub-${ley.id}-${i}`">{{ s }}</div>
                  </div>
                </div>
                <div class="leyline-summary-others">
                  <span>工坊：待实现</span> ｜ <span>结界：待实现</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 行动记录 -->
    <div class="table-container" style="margin-top:1rem;">
      <h2 class="collapsible-header" @click="collapsedSections.actionRecords = !collapsedSections.actionRecords" style="margin:0;padding:0.5rem 1rem;">
        <span class="collapse-arrow">{{ collapsedSections.actionRecords ? '▶' : '▼' }}</span>
        行动记录
      </h2>
      <div class="table-wrapper" v-show="!collapsedSections.actionRecords">
        <table class="holy-grail-table">
          <thead>
            <tr>
              <th>回合数</th>
              <th v-for="(hc, i) in actionRecordHeaderClasses" :key="`rec-h-${i}`">{{ hc }}阶</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(label, ri) in actionRecordRowLabels" :key="`rec-row-${ri}`">
              <tr :class="{ 'current-round-row': (ri + 1) === currentTurn }">
                <td :rowspan="2" style="text-align:left;vertical-align:middle;">{{ label }}</td>
                <td v-for="(hc, ci) in actionRecordHeaderClasses" :key="`rec-${ri}-s-${ci}`" class="servant-record-row">
                  <div class="record-cell-servant">{{ getHistoryServantForRound(ri + 1, ci) || '-' }}</div>
                </td>
              </tr>
              <tr :class="{ 'current-round-row': (ri + 1) === currentTurn }">
                <td v-for="(hc, ci) in actionRecordHeaderClasses" :key="`rec-${ri}-m-${ci}`" class="master-record-row">
                  <div class="record-cell-master">{{ getHistoryMasterForRound(ri + 1, ci) || '-' }}</div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
    
    
    </div>
    <div v-else class="no-campaign-hint">
      <p>请先选择一个战役或创建新战役</p>
    </div>

    <!-- 创建战役对话框 -->
    <div v-if="showCreateDialog" class="dialog-overlay" @click.self="showCreateDialog = false">
      <div class="dialog">
        <div class="dialog-header">
          <h2>创建新战役</h2>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label>战役名称 *</label>
            <input 
              v-model="newCampaignName" 
              type="text" 
              class="form-input"
              placeholder="请输入战役名称"
            />
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea 
              v-model="newCampaignDescription" 
              class="form-input"
              rows="3"
              placeholder="请输入战役描述（可选）"
            ></textarea>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-secondary" @click="showCreateDialog = false">取消</button>
          <button class="btn btn-primary" @click="handleCreateCampaign">创建</button>
        </div>
      </div>
    </div>

    <!-- 删除确认对话框 -->
    <div v-if="showDeleteDialog" class="dialog-overlay" @click.self="showDeleteDialog = false">
      <div class="dialog">
        <div class="dialog-header">
          <h2>确认删除</h2>
        </div>
        <div class="dialog-body">
          <p>你确定要删除选中的 <strong>{{ selectedCampaigns.size }}</strong> 个战役吗？此操作不可撤销。</p>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-secondary" @click="showDeleteDialog = false">取消</button>
          <button class="btn btn-danger" @click="handleDeleteCampaigns">确认删除</button>
        </div>
      </div>
    </div>

      </main>
    </div>
  </section>
</template>

<style scoped>
.battle-control {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* ========== 整体布局：侧边栏 + 主内容区 ========== */
.battle-layout {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
}

.sidebar {
  width: 360px;
  flex-shrink: 0;
  position: sticky;
  top: 1rem;
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* 侧边栏内卡片内容更紧凑 */
.sidebar .card-body {
  padding: 0.75rem 1rem;
}
.sidebar .card-header {
  padding: 0.6rem 1rem;
}
.sidebar .card-footer {
  padding: 0.5rem 1rem;
}
.sidebar th {
  padding: 0.4rem 0.4rem;
  font-size: 0.75rem;
}
.sidebar td {
  padding: 0.35rem 0.4rem;
  font-size: 0.8rem;
}
.sidebar .btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}
.sidebar .action-buttons {
  flex-wrap: wrap;
  gap: 0.25rem;
}

.sidebar-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0 0 0.25rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.main-content {
  flex: 1;
  min-width: 0;
}

.battle-control-section {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.no-campaign-hint {
  text-align: center;
  padding: 3rem;
  color: var(--color-text-secondary);
  font-size: 1.1rem;
}

/* ========== 顶部控制卡片（整合：信息 + 进度 + 按钮） ========== */
.top-control-card .progress-bar-wrapper {
  max-width: 800px;
  margin: 1rem auto 0;
}

.top-control-card .control-actions {
  margin-top: 1.25rem;
}

/* ========== 统计卡片（已删除，保留颜色变量以防引用） ========== */
.stat-blue { color: #2563eb; }
.stat-green { color: #16a34a; }
.stat-purple { color: #7c3aed; }
.stat-orange { color: #ea580c; }

.card {
  background: white;
  border-radius: 0.75rem;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  border: 1px solid var(--color-border);
}

.card-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--color-bg-secondary);
}

.card-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.card-body {
  padding: 1.5rem;
}

.card-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.sidebar .search-create-bar {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: stretch;
}

.search-input {
  flex: 1;
  border: 1px solid var(--color-border);
  border-radius: 0.6rem;
  padding: 0.6rem 0.75rem;
  font-size: 1rem;
}

.search-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.table-container {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead {
  background: var(--color-bg-secondary);
}

th {
  text-align: left;
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  border-bottom: 1px solid var(--color-border);
}

th.text-right {
  text-align: right;
}

td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
}

tr:hover {
  background: var(--color-bg-secondary);
}

tr.active-campaign {
  background: rgba(102, 126, 234, 0.1);
  border-left: 3px solid #667eea;
}

.font-medium {
  font-weight: 500;
  color: var(--color-text-primary);
}

.text-secondary {
  color: var(--color-text-secondary);
}

.text-sm {
  font-size: 0.875rem;
}

.text-right {
  text-align: right;
}

.action-buttons {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.5rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.25);
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.35);
}

.btn-secondary {
  background: white;
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.btn-secondary:hover {
  background: var(--color-bg-secondary);
}

.btn-danger {
  background: #dc2626;
  color: white;
}

.btn-danger:hover {
  background: #b91c1c;
}

.retire-btn {
  margin-left: 0.5rem;
  background: transparent;
  border: none;
  color: #ff4d4f;
  cursor: pointer;
  font-size: 0.9rem;
}
.retire-btn:hover { color: #a21d1d; }
.resummon-btn {
  margin-left: 0.5rem;
  background: transparent;
  border: 1px solid #10b981;
  color: #10b981;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
}
.resummon-btn:hover {
  background: rgba(16,185,129,0.06);
}

.btn-warning {
  background: #fdcb6e;
  color: white;
  box-shadow: 0 4px 12px rgba(253, 203, 110, 0.25);
}

.btn-warning:hover {
  background: #e6b649;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(253, 203, 110, 0.35);
}

.btn-sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
}

.loading,
.empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--color-text-secondary);
}

.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: white;
  border-radius: 0.75rem;
  max-width: 28rem;
  width: 90%;
  max-height: 90vh;
  overflow: auto;
  box-shadow: 0 16px 32px rgba(0, 0, 0, 0.2);
}

.dialog-header {
  padding: 1.5rem;
  border-bottom: 1px solid var(--color-border);
}

.dialog-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.dialog-body {
  padding: 1.5rem;
}

.dialog-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: var(--color-text-primary);
}

.form-input {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.6rem 0.75rem;
  font-size: 1rem;
}

.form-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

textarea.form-input {
  resize: vertical;
  min-height: 80px;
}

.page-title {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.section-title {
  font-size: 1.75rem;
  font-weight: 700;
  margin-bottom: 1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.text-center {
  text-align: center;
}

.campaign-info {
  color: var(--color-text-secondary);
  font-size: 0.95rem;
}

.control-actions {
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-top: 1.5rem;
  flex-wrap: wrap;
}

.progress-bar {
  height: 1.5rem;
  background-color: #f0f0f0;
  border-radius: 9999px;
  overflow: hidden;
  margin: 1rem 0;
  position: relative;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.12);
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea, #764ba2);
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 0.5rem;
  transition: width 0.5s ease;
  position: relative;
  overflow: hidden;
}

.progress-fill::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
  animation: shimmer 2s infinite;
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.progress-text {
  color: white;
  font-weight: 500;
  font-size: 0.875rem;
  text-shadow: 0 1px 2px rgba(0,0,0,0.2);
  position: relative;
  z-index: 1;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  margin-top: 0.5rem;
}

.table-container {
  background: white;
  padding: 1.5rem;
  border-radius: 0.75rem;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  border: 1px solid var(--color-border);
}

.current-round-row {
  background: rgba(102, 126, 234, 0.06);
  border-left: 3px solid #667eea;
}

.servant-record-row {
  background: #fff8f0;
  color: #333;
}
.master-record-row {
  background: #f0f8ff;
  color: #333;
}
.record-cell-servant {
  font-weight: 500;
  color: #7a3f00;
}
.record-cell-master {
  font-weight: 500;
  color: #0b66b2;
}

.table-container h2 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: var(--color-text-primary);
  border-bottom: 2px solid #667eea;
  padding-bottom: 0.5rem;
}

.table-wrapper {
  overflow-x: auto;
}

.holy-grail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
  margin-top: 1rem;
}

.holy-grail-table th,
.holy-grail-table td {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  text-align: center;
  min-width: 80px;
}

.holy-grail-table th {
  font-weight: bold;
  background-color: #ff6b6b;
  color: white;
  position: sticky;
  top: 0;
  z-index: 5;
}

.holy-grail-table tr:nth-child(1) th {
  background-color: #ff6b6b;
}

.holy-grail-table .master-row,
.holy-grail-table .servant-row {
  background-color: #ffeaa7;
}

.holy-grail-table .mana-row,
.holy-grail-table .status-row {
  background-color: #fdcb6e;
}

.holy-grail-table .low-mana {
  color: #d63031;
  font-weight: bold;
}

.holy-grail-table .normal-mana {
  color: #00b894;
}

.command-seals {
  display: flex;
  gap: 0.25rem;
  justify-content: center;
}

.seal {
  width: 16px;
  height: 16px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border-radius: 50%;
  box-shadow: 0 0 5px rgba(102, 126, 234, 0.3);
}

.seal-used {
  width: 16px;
  height: 16px;
  background-color: var(--color-border);
  border-radius: 50%;
  opacity: 0.6;
}

.mana-input {
  width: 60px;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 0.25rem;
  text-align: center;
  font-size: 0.875rem;
  background-color: white;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.mana-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
}

.mana-input:disabled {
  background-color: #f9fafb;
  color: #9ca3af;
  cursor: not-allowed;
}

.command-seals-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.command-seals-input {
  width: 50px;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 0.25rem;
  text-align: center;
  font-size: 0.875rem;
  background-color: white;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.command-seals-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
}

.command-seals-input:disabled {
  background-color: #f9fafb;
  color: #9ca3af;
  cursor: not-allowed;
}

.command-seals-display {
  display: flex;
  gap: 0.25rem;
  justify-content: center;
}

.input-with-indicator {
  position: relative;
  display: inline-block;
}

.save-indicator {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 10px;
}

.indicator-icon {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  font-weight: bold;
}

.indicator-icon.saving {
  background-color: #fbbf24;
  color: white;
  animation: pulse 1s infinite;
}

.indicator-icon.saved {
  background-color: #10b981;
  color: white;
}

.indicator-icon.error {
  background-color: #ef4444;
  color: white;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.mana-input.saving {
  border-color: #fbbf24;
  box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.2);
}

.mana-input.saved {
  border-color: #10b981;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
}

.mana-input.error {
  border-color: #ef4444;
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2);
}

.command-seals-input.saving {
  border-color: #fbbf24;
  box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.2);
}

.command-seals-input.saved {
  border-color: #10b981;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
}

.command-seals-input.error {
  border-color: #ef4444;
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2);
}

.status-effects-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 60px;
}

.status-effect-selector {
  margin-bottom: 0.5rem;
}

.status-effect-dropdown {
  width: 100%;
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  background-color: white;
  font-size: 0.875rem;
  color: var(--color-text-primary);
  transition: border-color 0.2s, box-shadow 0.2s;
  cursor: pointer;
}

.status-effect-dropdown:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
}

.status-effect-dropdown:disabled {
  background-color: #f9fafb;
  color: #9ca3af;
  cursor: not-allowed;
}

.status-effects-display {
  min-height: 24px;
}

.status-effects-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.status-effect-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: linear-gradient(135deg, #f3f4f6, #e5e7eb);
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  white-space: nowrap;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  transition: all 0.2s;
}

.status-effect-tag:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.effect-name {
  font-weight: 500;
  color: #374151;
}

.effect-controls {
  display: flex;
  align-items: center;
  gap: 0.125rem;
}

.level-btn, .remove-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  line-height: 1;
  padding: 0.125rem;
  margin: 0;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;
}

.level-btn {
  color: #6b7280;
  background-color: #f9fafb;
  border: 1px solid #d1d5db;
}

.level-btn:hover {
  background-color: #e5e7eb;
  color: #374151;
}

.remove-btn {
  color: #ef4444;
  background-color: #fef2f2;
  border: 1px solid #fecaca;
}

.remove-btn:hover {
  background-color: #fee2e2;
  color: #dc2626;
  transform: scale(1.1);
}

.level-display {
  font-weight: 600;
  color: #1f2937;
  min-width: 16px;
  text-align: center;
  font-size: 0.75rem;
}

.leyline-summary-characters {
  margin-top: 0.5rem;
  font-size: 0.95rem;
}

.leyline-summary-others {
  margin-top: 0.25rem;
  font-size: 0.9rem;
  color: var(--color-text-secondary);
}

/* ---- 灵脉详情面板布局 ---- */
.leyline-layout {
  display: flex;
  gap: 1.5rem;
}
.leyline-list-panel {
  flex: 0 0 300px;
}
.leyline-detail-panel {
  flex: 1;
}
.leyline-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.leyline-item-summary {
  padding: 0.6rem 0.8rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  cursor: pointer;
}
.leyline-item-summary:hover { background: #f8f9ff; }
.leyline-item-summary.active { border-color: #667eea; background: #f0f2ff; }
.leyline-name-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.leyline-name-text { font-weight: 600; }
.leyline-meta { font-size: 0.8rem; color: var(--color-text-secondary); }

/* 灵脉大小徽章 */
.leyline-size-badge {
  font-size: 0.7rem;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  font-weight: 500;
}
.leyline-size-badge.size-empty   { background: #f3f4f6; color: #6b7280; }
.leyline-size-badge.size-small   { background: #dbeafe; color: #2563eb; }
.leyline-size-badge.size-medium  { background: #fef3c7; color: #d97706; }
.leyline-size-badge.size-large   { background: #fee2e2; color: #dc2626; }

/* 灵脉所有者徽章 */
.leyline-owner-badge {
  font-size: 0.7rem;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  background: #ecfdf5;
  color: #059669;
  font-weight: 500;
}

/* 详情行布局 */
.detail-row {
  margin-bottom: 1rem;
}
.detail-row.three-cols {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 0.75rem;
}
.detail-row.two-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.detail-field { display: flex; flex-direction: column; }
.detail-label { font-weight: 500; font-size: 0.85rem; margin-bottom: 0.25rem; color: var(--color-text-primary); }
.detail-input {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.5rem 0.6rem;
  font-size: 0.9rem;
}
.detail-input:focus { outline: none; border-color: #667eea; }
.detail-textarea {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.5rem 0.6rem;
  font-size: 0.9rem;
  resize: vertical;
  min-height: 60px;
}
.detail-textarea:focus { outline: none; border-color: #667eea; }
.detail-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .control-actions {
    flex-direction: column;
    align-items: center;
  }
  
  .btn {
    width: 100%;
    max-width: 300px;
  }
  
  .table-container {
    padding: 1rem;
  }
  
  th, td {
    padding: 0.5rem;
    font-size: 0.75rem;
  }
}

/* ---- 响应式：窄屏时侧边栏变顶部 ---- */
@media (max-width: 900px) {
  .battle-layout {
    flex-direction: column;
  }
  .sidebar {
    width: 100%;
    position: static;
    max-height: none;
    overflow-y: visible;
  }
}

/* ---- 可折叠区域 ---- */
.collapsible-header {
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: background 0.15s ease;
}
.collapsible-header:hover {
  background: #f0f2ff;
}
.collapse-arrow {
  font-size: 0.7rem;
  color: #888;
  flex-shrink: 0;
}


/* ---- 契约绑定行 ---- */
.contract-cell {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 130px;
}
.contract-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem;
  font-size: 0.7rem;
}
.contract-tag-item {
  display: inline-flex;
  align-items: center;
  gap: 0.1rem;
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  background: #f0f8ff;
  border: 1px solid #a0c8f0;
  white-space: nowrap;
}
.contract-tag-type {
  font-weight: 600;
  color: #0b66b2;
}
.contract-tag-arrow {
  color: #888;
}
.contract-tag-role {
  font-weight: 500;
}
.contract-tag-master {
  color: #b45309; /* 琥珀色，代表"主"/立约人 */
}
.contract-tag-servant {
  color: #6d28d9; /* 紫色，代表"从"/签约人 */
}
.contract-break-btn {
  background: none;
  border: none;
  color: #ef4444;
  cursor: pointer;
  font-size: 0.8rem;
  line-height: 1;
  padding: 0;
  margin: 0;
}
.contract-break-btn:hover {
  color: #dc2626;
}
.contract-none {
  color: #bbb;
  font-style: italic;
  font-size: 0.75rem;
}
.contract-edit {
  display: flex;
  gap: 0.2rem;
  align-items: center;
}
.contract-type-select,
.contract-initiator-select,
.contract-target-select {
  font-size: 0.7rem;
  padding: 0.15rem 0.3rem;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  background: white;
  max-width: 100px;
}
.contract-type-select:focus,
.contract-initiator-select:focus,
.contract-target-select:focus {
  border-color: #667eea;
  outline: none;
}
.contract-initiator-select {
  color: #b45309; /* 琥珀色，提示这是选择"主动方" */
}
.contract-saving {
  font-size: 0.7rem;
}
</style>
