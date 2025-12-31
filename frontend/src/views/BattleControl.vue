<script setup>
import { ref, computed, onMounted } from 'vue'
import { onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listCampaigns, createCampaign, deleteCampaign, getSelectedCampaign } from '../services/campaign'
import { closeCurrentRound, listRoundHistory, getCurrentRound, createNextRound } from '../services/round'
import { listCharacterCards } from '../services/characterCard'
import { listLeylines, createLeyline, updateLeyline, deleteLeyline } from '../services/leyline'
import { listLeylineAssignments, upsertLeylineAssignment } from '../services/leyline'
import { assignLeylineBulk } from '../services/leyline'
import { retireCharacterCard, unretireCharacterCard } from '../services/characterCard'
import {
  updateCharacterStatus,
  getCharacterStatusesByCampaignAndRound,
  getCharacterStatus
} from '../services/characterStatus'
import {
  STATUS_EFFECTS,
  StatusType,
  getAllStatusEffects,
  createStatusEffect,
  formatStatusEffectDisplay,
  parseStatusEffectFromDisplay,
  getStatusType,
  getStatusTypeDisplayName
} from '../services/statusEffects'

const route = useRoute()
const router = useRouter()

function makeNullArray(len) {
  const arr = []
  for (let i = 0; i < len; i++) arr.push(null)
  return arr
}
const createNullArray = makeNullArray
// safer helper to create null-filled arrays without relying on Array.fill
const safeNullArray = (len) => {
  const n = Number(len) || 0
  const arr = []
  for (let i = 0; i < n; i++) arr.push(null)
  return arr
}
// note: create arrays inline to avoid runtime name-shadowing issues

// 战役管理相关
const campaigns = ref([])
const loading = ref(false)
const searchQuery = ref('')
const selectedCampaigns = ref(new Set())
const showCreateDialog = ref(false)
const showDeleteDialog = ref(false)
const newCampaignName = ref('')
const newCampaignDescription = ref('')
const selectAll = ref(false)

// 当前战役信息
const campaignId = ref(null)
const campaignName = ref('')
// 回合：默认从「降临日」开始，共 29 回合（降临日 + 14 天 * 昼夜）
const currentTurn = ref(1)
const totalTurns = ref(29)

// 圣杯魔力量
const holyGrailMana = ref(0)
// track retire counts to compute holy grail scale
const servantDeathsCount = ref(0)
const masterDeathsCount = ref(0)

const holyGrailScale = computed(() => {
  return servantDeathsCount.value + Math.floor(masterDeathsCount.value / 2)
})

const holyGrailTier = computed(() => {
  const s = holyGrailScale.value
  if (s >= 8) return '大圣杯'
  if (s >= 6) return '中圣杯'
  if (s >= 4) return '小圣杯'
  return '极小圣杯'
})

// 当前回合信息表数据（默认 7 组阶职，具体数据后续从后台填充）
const roundInfo = ref({
  classes: ['弓', '枪', '骑', '剑', '杀', '术', '狂'],
  servantNames: ['', '', '', '', '', '', ''],
  masterNames: ['', '', '', '', '', '', ''],
  servantMana: [0, 0, 0, 0, 0, 0, 0],
  masterMana: [0, 0, 0, 0, 0, 0, 0],
  commandSeals: [3, 3, 3, 3, 3, 3, 3],
  statusEffects: [[], [], [], [], [], [], []], // 每个角色的异常状态列表
})

// 角色状态映射（按阶职索引存储）
const characterStatuses = ref(new Map())

// 自动保存状态管理
const autoSaveStates = new Map() // 跟踪每个字段的保存状态
const AUTO_SAVE_DELAY = 2000 // 2秒后自动保存

// 保存状态指示器
const saveIndicators = ref(new Map()) // 跟踪每个输入框的保存状态

// 获取选中状态效果的名称数组
function getSelectedStatusEffects(slotIndex) {
  return roundInfo.value.statusEffects[slotIndex].map(effect => effect.name)
}

// 添加异常状态
function addStatusEffect(slotIndex, effectName) {
  if (!effectName) return

  const currentEffects = roundInfo.value.statusEffects[slotIndex]

  // 检查是否已经存在
  if (currentEffects.some(e => e.name === effectName)) {
    return // 已经存在，不重复添加
  }

  // 添加新效果
  const newEffects = [...currentEffects, createStatusEffect(effectName, 1)]
  updateStatusEffects(slotIndex, newEffects, true)
}

// 获取可用的异常状态（排除已选择的）
function getAvailableStatusEffects(slotIndex, effectType) {
  const currentEffects = roundInfo.value.statusEffects[slotIndex]
  const selectedNames = new Set(currentEffects.map(e => e.name))
  return effectType.filter(effect => !selectedNames.has(effect))
}

// 调整异常状态层数
function adjustStatusEffectLevel(slotIndex, effectName, delta) {
  const effects = [...roundInfo.value.statusEffects[slotIndex]]
  const effectIndex = effects.findIndex(e => e.name === effectName)

  if (effectIndex !== -1) {
    const newLevel = Math.max(1, effects[effectIndex].level + delta)
    effects[effectIndex] = { ...effects[effectIndex], level: newLevel }
    updateStatusEffects(slotIndex, effects, true)
  }
}

// 移除异常状态
function removeStatusEffect(slotIndex, effectName) {
  const effects = roundInfo.value.statusEffects[slotIndex].filter(e => e.name !== effectName)
  updateStatusEffects(slotIndex, effects, true)
}

// 行动顺序数据（按结算顺序：机动-魂食-干涉-解放-制造-信息-休整-摧毁工房）
const actionOrder = ref([
  { type: '机动', actions: ['', '', '', '', '', '', ''] },
  { type: '魂食', actions: ['', '', '', '', '', '', ''] },
  { type: '干涉', actions: ['', '', '', '', '', '', ''] },
  { type: '解放', actions: ['', '', '', '', '', '', ''] },
  { type: '制造', actions: ['', '', '', '', '', '', ''] },
  { type: '信息', actions: ['', '', '', '', '', '', ''] },
  { type: '休整', actions: ['', '', '', '', '', '', ''] },
  { type: '摧毁工房', actions: ['', '', '', '', '', '', ''] },
])

function resetActionOrderActions() {
  const len = Number(roundInfo.value.classes.length) || 0
  actionOrder.value.forEach(a => {
    a.actions = new Array(len).fill('')
  })
}

function detectActionCategoryFromText(text) {
  if (!text) return null
  const t = String(text).toLowerCase()
  // treat standby as movement
  if (t.includes('待机') || t.includes('待命')) return '机动'
  // 恶性魂食视为机动
  if (t.includes('恶性魂食') || t.includes('恶性魂')) return '机动'
  if (t.includes('机动') || t.includes('移动')) return '机动'
  if (t.includes('魂食')) return '魂食'
  if (t.includes('干涉')) return '干涉'
  if (t.includes('解放')) return '解放'
  if (t.includes('摧毁工') || (t.includes('摧毁') && t.includes('工坊'))) return '摧毁工房'
  if (t.includes('制造') || t.includes('建筑') || t.includes('工坊') || t.includes('礼装')) return '制造'
  if (t.includes('侦察') || t.includes('侦查') || t.includes('信息') || t.includes('调查') || t.includes('资料') || t.includes('情报')) return '信息'
  if (t.includes('休整')) return '休整'
  // fallback: if contains keywords likely 机动/魂食/干涉
  if (t.includes('from') || t.includes('至') || t.includes('->')) return '机动'
  return null
}

function applySubmissionsToActionOrder() {
  resetActionOrderActions()
  const len = Number(roundInfo.value.classes.length) || 0
  for (let slot = 0; slot < len; slot++) {
    const texts = []
    if (servantActions.value[slot]) texts.push(servantActions.value[slot])
    if (masterActions.value[slot]) texts.push(masterActions.value[slot])
    texts.forEach(txt => {
      const cat = detectActionCategoryFromText(txt)
      if (!cat) return
      const idx = actionOrder.value.findIndex(a => a.type === cat)
      if (idx === -1) return
      const existing = actionOrder.value[idx].actions[slot] || ''
      actionOrder.value[idx].actions[slot] = existing ? `${existing} / ${txt}` : txt
    })
  }
  // default empty slots to 待机 and categorize as 机动
  for (let slot = 0; slot < (Number(roundInfo.value.classes.length) || 0); slot++) {
    let hasAny = false
    for (let a of actionOrder.value) {
      if (a.actions && a.actions[slot] && String(a.actions[slot]).trim() !== '') { hasAny = true; break }
    }
    if (!hasAny) {
      const mi = actionOrder.value.findIndex(a => a.type === '机动')
      if (mi !== -1) {
        actionOrder.value[mi].actions[slot] = '待机'
      }
    }
  }
}

// 实时显示的提交：按槽位的从者/御主提交内容
const servantActions = ref(safeNullArray(roundInfo.value.classes.length))
const masterActions = ref(safeNullArray(roundInfo.value.classes.length))

// 统计信息
const stats = computed(() => {
  const active = campaigns.value.filter(c => !c.completed).length
  const completed = campaigns.value.filter(c => c.completed).length
  return {
    active,
    completed,
    total: campaigns.value.length,
  }
})

// 过滤后的战役列表
const filteredCampaigns = computed(() => {
  if (!searchQuery.value.trim()) {
    return campaigns.value
  }
  const query = searchQuery.value.toLowerCase()
  return campaigns.value.filter(c => 
    c.name.toLowerCase().includes(query) || 
    (c.description && c.description.toLowerCase().includes(query))
  )
})

// 加载战役列表
async function loadCampaigns() {
  loading.value = true
  try {
    campaigns.value = await listCampaigns()
    // 如果有路由参数，加载对应战役信息
    const routeCampaignId = route.params.campaignId
    if (routeCampaignId) {
      const campaign = campaigns.value.find(c => c.id === Number(routeCampaignId))
      if (campaign) {
        campaignId.value = campaign.id
        campaignName.value = campaign.name
        await loadCharacterCards()
        await loadLeylines()
        // load current round from backend
        try {
          const r = await getCurrentRound(campaignId.value)
          if (r && r.round && r.round.turnNumber != null) {
            currentTurn.value = Number(r.round.turnNumber)
          }
        } catch (e) {
          console.error('获取当前回合失败', e)
        }
        // load persisted history for this campaign
        try {
          await loadHistory()
        } catch (e) { console.error('加载历史记录失败', e) }
      }
    } else if (campaigns.value.length > 0) {
      // 如果没有路由参数，使用第一个战役
      const firstCampaign = campaigns.value[0]
      campaignId.value = firstCampaign.id
      campaignName.value = firstCampaign.name
      await loadCharacterCards()
      await loadLeylines()
      try {
        const r = await getCurrentRound(campaignId.value)
        if (r && r.round && r.round.turnNumber != null) {
          currentTurn.value = Number(r.round.turnNumber)
        }
      } catch (e) {
        console.error('获取当前回合失败', e)
      }
      try {
        await loadHistory()
      } catch (e) { console.error('加载历史记录失败', e) }
    }
  } catch (err) {
    console.error('加载战役列表失败:', err)
  } finally {
    loading.value = false
  }
}

// 创建战役
async function handleCreateCampaign() {
  if (!newCampaignName.value.trim()) {
    alert('请输入战役名称')
    return
  }
  try {
    const campaign = await createCampaign(newCampaignName.value.trim(), newCampaignDescription.value.trim())
    showCreateDialog.value = false
    newCampaignName.value = ''
    newCampaignDescription.value = ''
    await loadCampaigns()
    // 自动切换到新创建的战役
    campaignId.value = campaign.id
    campaignName.value = campaign.name
    router.push(`/battle-control/${campaign.id}`)
  } catch (err) {
    alert('创建失败: ' + err.message)
  }
}

// 删除战役
async function handleDeleteCampaigns() {
  if (selectedCampaigns.value.size === 0) {
    alert('请选择要删除的战役')
    return
  }
  try {
    const ids = Array.from(selectedCampaigns.value)
    await Promise.all(ids.map(id => deleteCampaign(id)))
    selectedCampaigns.value.clear()
    selectAll.value = false
    showDeleteDialog.value = false
    await loadCampaigns()
    // 如果删除的是当前战役，切换到第一个战役
    if (ids.includes(campaignId.value)) {
      if (campaigns.value.length > 0) {
        const firstCampaign = campaigns.value[0]
        campaignId.value = firstCampaign.id
        campaignName.value = firstCampaign.name
        router.push(`/battle-control/${firstCampaign.id}`)
      } else {
        campaignId.value = null
        campaignName.value = ''
        router.push('/battle-control')
      }
    }
  } catch (err) {
    alert('删除失败: ' + err.message)
  }
}

// 切换全选
function toggleSelectAll() {
  if (selectAll.value) {
    filteredCampaigns.value.forEach(c => selectedCampaigns.value.add(c.id))
  } else {
    filteredCampaigns.value.forEach(c => selectedCampaigns.value.delete(c.id))
  }
}

// 切换单个选择
function toggleSelect(id) {
  if (selectedCampaigns.value.has(id)) {
    selectedCampaigns.value.delete(id)
  } else {
    selectedCampaigns.value.add(id)
  }
  // 更新全选状态
  selectAll.value = filteredCampaigns.value.length > 0 && 
    filteredCampaigns.value.every(c => selectedCampaigns.value.has(c.id))
}

// 选择战役（切换到该战役的控制界面）
async function selectCampaign(campaign) {
  campaignId.value = campaign.id
  campaignName.value = campaign.name
  await loadCharacterCards()
  await loadLeylines()
  router.push(`/battle-control/${campaign.id}`)
}

// 跳转到人物卡上传页面
function goToCharacterCardUpload(campaignId) {
  router.push(`/character-card-upload/${campaignId}`)
}

// 回合名称映射（降临日 -> 第 N 日昼/夜）
const currentTurnLabel = computed(() => {
  const turn = currentTurn.value
  if (turn <= 1) return '降临日'
  const k = turn - 2 // 从 0 开始的索引，对应 第 1 日昼
  const day = Math.floor(k / 2) + 1 // 1 ~ 14
  const isDay = k % 2 === 0
  const dayMap = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四']
  const dayStr = dayMap[Math.min(day - 1, dayMap.length - 1)]
  return `第${dayStr}日${isDay ? '昼' : '夜'}`
})

// 计算进度百分比
const progressPercent = computed(() => {
  return Math.round((currentTurn.value / totalTurns.value) * 100)
})

// 当前战役的人物卡列表
const characterCards = ref([])

// 当前战役的灵脉列表
const leylines = ref([])

async function loadCharacterCards() {
  if (!campaignId.value) {
    characterCards.value = []
    return
  }
    try {
    const res = await listCharacterCards(0, 200, null, campaignId.value)
    // 包含当前战役角色与通用角色（campaignId 为 null 的为通用卡）
    const list = res?.content || []
    characterCards.value = list.filter(item => item.campaignId === campaignId.value || item.campaignId == null)
  } catch (err) {
    console.error('加载人物卡失败:', err)
    characterCards.value = []
  }
  // 统计已退场的角色数以计算圣杯规模
  servantDeathsCount.value = characterCards.value.filter(c => c.cardType === 'SERVANT' && c.retired).length
  masterDeathsCount.value = characterCards.value.filter(c => c.cardType === 'MASTER' && c.retired).length
  // 角色加载完成后，加载角色状态
  await loadCharacterStatuses()
  // caller 会加载灵脉并由灵脉中的 assignedCharacterIds 填充指派
}

async function loadCharacterStatuses() {
  if (!campaignId.value) {
    characterStatuses.value = new Map()
    // 重置roundInfo为默认值
    resetRoundInfoToDefaults()
    return
  }
  try {
    const statuses = await getCharacterStatusesByCampaignAndRound(campaignId.value, currentTurn.value)
    const statusMap = new Map()

    // 将状态按角色卡ID分组
    statuses.forEach(status => {
      statusMap.set(status.characterCardId, status)
    })

    characterStatuses.value = statusMap

    // 更新roundInfo中的数据
    updateRoundInfoFromStatuses()
  } catch (err) {
    console.error('加载角色状态失败:', err)
    characterStatuses.value = new Map()
    // 即使加载失败也要重置为默认值，确保UI一致性
    resetRoundInfoToDefaults()
  }
}

function resetRoundInfoToDefaults() {
  // 重置魔力和令咒为默认值
  roundInfo.value.servantMana = safeNullArray(roundInfo.value.classes.length)
  roundInfo.value.masterMana = safeNullArray(roundInfo.value.classes.length)
  roundInfo.value.commandSeals = new Array(roundInfo.value.classes.length).fill(3)
}

function updateRoundInfoFromStatuses() {
  // 重置数据
  roundInfo.value.servantMana = safeNullArray(roundInfo.value.classes.length)
  roundInfo.value.masterMana = safeNullArray(roundInfo.value.classes.length)
  roundInfo.value.commandSeals = new Array(roundInfo.value.classes.length).fill(3)
  roundInfo.value.statusEffects = roundInfo.value.classes.map(() => [])

  // 从状态数据更新显示
  characterCards.value.forEach(card => {
    const status = characterStatuses.value.get(card.id)
    if (!status) return

    const cls = normalizeClassName(card.className)
    const idx = roundInfo.value.classes.indexOf(cls)
    if (idx === -1) return

    if (card.cardType === 'SERVANT') {
      if (status.currentMana != null) {
        roundInfo.value.servantMana[idx] = status.currentMana
      }
    } else if (card.cardType === 'MASTER') {
      if (status.currentMana != null) {
        roundInfo.value.masterMana[idx] = status.currentMana
      }
      if (status.currentCommandSeals != null) {
        roundInfo.value.commandSeals[idx] = status.currentCommandSeals
      }
    }

    // 更新异常状态
    if (status.statusEffectsList && Array.isArray(status.statusEffectsList)) {
      roundInfo.value.statusEffects[idx] = status.statusEffectsList
    }
  })
}

async function loadLeylines() {
  if (!campaignId.value) {
    leylines.value = []
    return
  }
  try {
    const res = await listLeylines(campaignId.value)
    leylines.value = (res || []).map(ley => ({
      ...ley,
      manaAmount: ley.manaAmount ?? 0,
      battlefieldWidth: ley.battlefieldWidth ?? 0,
      populationFlow: ley.populationFlow ?? 0,
      assignedCharacterIds: ley.assignedCharacterIds || []
    }))
    // populate servant/master leyline ids from leylines.assignedCharacterIds
    // reset first
    servantLeylineIds.value = safeNullArray(roundInfo.value.classes.length)
    masterLeylineIds.value = safeNullArray(roundInfo.value.classes.length)
    ;(leylines.value || []).forEach(ley => {
      (ley.assignedCharacterIds || []).forEach(cid => {
        const card = characterCards.value.find(c => c.id === cid)
        if (!card) return
        const cls = normalizeClassName(card.className)
        const idx = roundInfo.value.classes.indexOf(cls)
        if (idx === -1) return
        if (card.cardType === 'SERVANT') {
          servantLeylineIds.value[idx] = ley.id
        } else if (card.cardType === 'MASTER') {
          masterLeylineIds.value[idx] = ley.id
        }
      })
    })
  } catch (err) {
    console.error('加载灵脉失败:', err)
    leylines.value = []
  }
}

function getCharactersOnLeyline(leyId) {
  const servants = servantLeylineIds.value
    .map((id, idx) => (id != null && Number(id) === Number(leyId) ? (servantCodes.value[idx] || '-') : null))
    .filter(Boolean)
  const masters = masterLeylineIds.value
    .map((id, idx) => (id != null && Number(id) === Number(leyId) ? (masterCodes.value[idx] || '-') : null))
    .filter(Boolean)
  return { servants, masters }
}

// --- 灵脉管理相关（从 SkillRecord 移入） ---
const selectedLeyline = ref(null)
const leyLoading = ref(false)

async function loadLeylinesForCampaign() {
  if (!campaignId.value) {
    leylines.value = []
    return
  }
  leyLoading.value = true
  try {
    const res = await listLeylines(campaignId.value)
    leylines.value = (res || []).map(ley => ({
      ...ley,
      manaAmount: ley.manaAmount ?? 0,
      battlefieldWidth: ley.battlefieldWidth ?? 0,
      populationFlow: ley.populationFlow ?? 0,
    }))
    // 保持选中项
    if (selectedLeyline.value) {
      const found = leylines.value.find(l => l.id === selectedLeyline.value.id)
      selectedLeyline.value = found || null
    }
  } catch (err) {
    console.error('加载灵脉失败:', err)
    leylines.value = []
  } finally {
    leyLoading.value = false
  }
}

function normalizeClassName(className) {
  if (!className) return ''
  const text = String(className).toLowerCase()
  if (text.includes('archer') || text.includes('弓')) return '弓'
  if (text.includes('lancer') || text.includes('枪') || text.includes('槍')) return '枪'
  if (text.includes('assassin') || text.includes('杀')) return '杀'
  if (text.includes('rider') || text.includes('骑')) return '骑'
  if (text.includes('saber') || text.includes('剑')) return '剑'
  if (text.includes('caster') || text.includes('术')) return '术'
  if (text.includes('berserker') || text.includes('狂')) return '狂'
  // 其他职介不匹配则返回空，避免错配
  return ''
}

async function addLeyline() {
  if (!campaignId.value) {
    alert('请先选择战役')
    return
  }
  try {
    const res = await createLeyline(campaignId.value, '新灵脉', 0, 0, 0, '', '')
    await loadLeylines()
    // select new leyline
    const found = leylines.value.find(l => l.id === res.id)
    selectedLeyline.value = found || null
  } catch (err) {
    console.error('新建灵脉失败:', err)
    alert('新建灵脉失败：' + (err.message || err))
  }
}

async function saveLeyline(ley) {
  if (!campaignId.value) {
    alert('请先选择战役')
    return
  }
  try {
    if (ley.id) {
      await updateLeyline(ley.id, campaignId.value, ley.name || '', ley.manaAmount || 0, ley.battlefieldWidth || 0, ley.populationFlow || 0, ley.effect || '', ley.description || '')
    } else {
      const res = await createLeyline(campaignId.value, ley.name || '新灵脉', ley.manaAmount || 0, ley.battlefieldWidth || 0, ley.populationFlow || 0, ley.effect || '', ley.description || '')
      // in case new id returned
      ley.id = res && res.id ? res.id : ley.id
    }
    await loadLeylines()
    alert('已保存灵脉')
  } catch (err) {
    console.error('保存灵脉失败:', err)
    alert('保存灵脉失败：' + (err.message || err))
  }
}

async function removeLeyline(ley) {
  if (!ley || !ley.id) {
    alert('请选择一个要删除的灵脉')
    return
  }
  if (!confirm('确定删除该灵脉吗？')) return
  try {
    await deleteLeyline(ley.id)
    selectedLeyline.value = null
    await loadLeylines()
    alert('已删除灵脉')
  } catch (err) {
    console.error('删除灵脉失败:', err)
    alert('删除灵脉失败：' + (err.message || err))
  }
}

// 按阶职映射到从者 / 御主代号
const servantCodes = computed(() => {
  return roundInfo.value.classes.map((slotCls) => {
    const card = characterCards.value.find(
      (c) => c.cardType === 'SERVANT' && normalizeClassName(c.className) === slotCls,
    )
    return card?.code || ''
  })
})

const masterCodes = computed(() => {
  return roundInfo.value.classes.map((slotCls) => {
    const card = characterCards.value.find(
      (c) => c.cardType === 'MASTER' && normalizeClassName(c.className) === slotCls,
    )
    return card?.code || ''
  })
})

// 灵脉选择（暂存于前端，用于展示）
const servantLeylineIds = ref(safeNullArray(roundInfo.value.classes.length))
const masterLeylineIds = ref(safeNullArray(roundInfo.value.classes.length))
const assignmentSaving = ref(false)
// 历史动作（按回合记录）
const historyActions = ref([])
// 固定的行动记录表头与行（跳伞 + 第1~14天昼夜）
const actionRecordHeaderClasses = ['剑', '弓', '枪', '骑', '术', '杀', '狂']

function buildActionRecordRowLabels() {
  const labels = ['跳伞']
  const dayMap = ['一','二','三','四','五','六','七','八','九','十','十一','十二','十三','十四']
  for (let d = 1; d <= 14; d++) {
    const dayStr = dayMap[Math.min(d-1, dayMap.length-1)]
    labels.push(`第${dayStr}天昼行动`)
    labels.push(`第${dayStr}天夜行动`)
  }
  return labels
}
const actionRecordRowLabels = buildActionRecordRowLabels()

function getHistoryCellForRound(roundNumber, slotIndex) {
  const r = historyActions.value.find(h => Number(h.roundNumber) === Number(roundNumber))
  if (r) {
    // prefer actionOrder if present
    if (Array.isArray(r.actionOrder) && r.actionOrder.length > 0) {
      const parts = []
      r.actionOrder.forEach(cat => {
        if (cat && Array.isArray(cat.actions)) {
          const v = cat.actions[slotIndex]
          if (v && String(v).trim()) parts.push(v)
        }
      })
      if (parts.length > 0) return parts.join(' / ')
    }
    // fallback to servant/master arrays
    const parts = []
    if (Array.isArray(r.servantActions)) {
      const s = r.servantActions[slotIndex]
      if (s && String(s).trim()) parts.push(s)
    }
    if (Array.isArray(r.masterActions)) {
      const m = r.masterActions[slotIndex]
      if (m && String(m).trim()) parts.push(m)
    }
    if (parts.length > 0) return parts.join(' / ')
  }
  return ''
}

function getHistoryServantForRound(roundNumber, slotIndex) {
  const r = historyActions.value.find(h => Number(h.roundNumber) === Number(roundNumber))
  if (!r) {
    return Number(roundNumber) <= Number(currentTurn.value) ? '待机' : ''
  }
  if (Array.isArray(r.servantActions)) {
    const v = r.servantActions[slotIndex]
    if (v && String(v).trim()) return v
  }
  return Number(roundNumber) <= Number(currentTurn.value) ? '待机' : ''
}

function getHistoryMasterForRound(roundNumber, slotIndex) {
  const r = historyActions.value.find(h => Number(h.roundNumber) === Number(roundNumber))
  if (!r) {
    return Number(roundNumber) <= Number(currentTurn.value) ? '待机' : ''
  }
  if (Array.isArray(r.masterActions)) {
    const v = r.masterActions[slotIndex]
    if (v && String(v).trim()) return v
  }
  return Number(roundNumber) <= Number(currentTurn.value) ? '待机' : ''
}

async function loadLeylineAssignments() {
  if (!campaignId.value) return
  try {
    const res = await listLeylineAssignments(campaignId.value)
    console.log('loadLeylineAssignments res:', res)
    // reset
    servantLeylineIds.value = safeNullArray(roundInfo.value.classes.length)
    masterLeylineIds.value = safeNullArray(roundInfo.value.classes.length)
    (res || []).forEach(a => {
      const card = characterCards.value.find(c => c.id === a.characterCardId)
      if (!card) return
      const cls = normalizeClassName(card.className)
      const idx = roundInfo.value.classes.indexOf(cls)
      if (idx === -1) return
      if (card.cardType === 'SERVANT') {
        servantLeylineIds.value[idx] = a.leylineId || null
      } else {
        masterLeylineIds.value[idx] = a.leylineId || null
      }
    })
  } catch (err) {
    console.error('加载灵脉指派失败:', err)
  }
}

async function loadActionSubmissions() {
  if (!campaignId.value) return
  try {
    const res = await import('../services/actionSubmission.js').then(m => m.listCurrentSubmissions(campaignId.value))
    // reset (create inline to avoid any runtime name conflicts)
    {
      const len = Number(roundInfo.value.classes.length) || 0
      const a1 = []
      const a2 = []
      for (let i = 0; i < len; i++) { a1.push(null); a2.push(null) }
      servantActions.value = a1
      masterActions.value = a2
    }
    (res || []).forEach(s => {
      // only apply submissions for the current round (match roundNumber)
      if (s.roundNumber != null && Number(s.roundNumber) !== Number(currentTurn.value)) return
      // tolerant matching: normalize, then fallback to fuzzy matching against characterCards
      const idx = findSlotIndexFromServantClass(s.servantClass)
      if (idx === -1) return
      if (s.actionType === 'SERVANT_ACTION') servantActions.value[idx] = s.content || ''
      else masterActions.value[idx] = s.content || ''
    })
    // after loading submissions, map them into action order table
    try { applySubmissionsToActionOrder() } catch (e) { console.error('applySubmissionsToActionOrder failed', e) }
  } catch (err) {
    console.error('加载行动提交失败:', err)
  }
}

async function loadHistory() {
  if (!campaignId.value) {
    historyActions.value = []
    return
  }
  try {
    const res = await listRoundHistory(campaignId.value)
    historyActions.value = res || []
  } catch (e) {
    console.error('加载历史记录失败:', e)
    historyActions.value = []
  }
}

function connectActionSSE() {
  if (!campaignId.value) return
  try {
    if (actionEventSource) {
      try { actionEventSource.close() } catch (e) {}
      actionEventSource = null
    }
    actionEventSource = new EventSource(`${API_BASE}/action-submissions/stream?campaignId=${campaignId.value}`)
    actionEventSource.addEventListener('submission', (e) => {
      try {
        const obj = JSON.parse(e.data)
        const idx = findSlotIndexFromServantClass(obj.servantClass)
        if (idx === -1) return
        if (obj.actionType === 'SERVANT_ACTION') servantActions.value[idx] = obj.content || ''
        else masterActions.value[idx] = obj.content || ''
      } catch (err) { console.error('处理 submission SSE 失败', err) }
    })
    actionEventSource.addEventListener('connected', () => {
      // refresh existing submissions once connected
      loadActionSubmissions()
    })
    actionEventSource.onerror = (err) => {
      console.error('行动提交 SSE 错误', err)
    }
  } catch (err) {
    console.error('connectActionSSE failed', err)
  }
}

function findSlotIndexFromServantClass(servantClass) {
  if (!servantClass) return -1
  // 1) normalize and direct match
  const norm = normalizeClassName(servantClass)
  let idx = roundInfo.value.classes.indexOf(norm)
  if (idx !== -1) return idx

  const text = String(servantClass).toLowerCase()
  // 2) try to match by className substring on loaded characterCards
  for (let i = 0; i < roundInfo.value.classes.length; i++) {
    const cls = roundInfo.value.classes[i]
    const card = characterCards.value.find(c => normalizeClassName(c.className) === cls && String(c.className || '').toLowerCase().includes(text))
    if (card) return i
  }
  // 3) try to match by code (exact)
  for (let i = 0; i < roundInfo.value.classes.length; i++) {
    const card = characterCards.value.find(c => String(c.code || '').toLowerCase() === text)
    if (card) {
      const cls = normalizeClassName(card.className)
      const idx2 = roundInfo.value.classes.indexOf(cls)
      if (idx2 !== -1) return idx2
    }
  }
  return -1
}

async function assignCharacterToLeyline(slotIndex, type) {
  if (!campaignId.value) {
    alert('请先选择战役')
    return
  }
  const leyId = type === 'SERVANT' ? servantLeylineIds.value[slotIndex] : masterLeylineIds.value[slotIndex]
  // 找到对应角色卡
  const cls = roundInfo.value.classes[slotIndex]
  const card = characterCards.value.find(c => c.cardType === type && normalizeClassName(c.className) === cls)
  if (!card) {
    alert('未找到对应的角色卡，无法保存指派。请先上传该战役的角色卡。')
    return
  }
  try {
    await upsertLeylineAssignment(campaignId.value, leyId || null, card.id)
  } catch (err) {
    console.error('保存指派失败:', err)
    alert('保存指派失败：' + (err.message || err))
  }
}

function getCardBySlot(slotIndex, type) {
  const cls = roundInfo.value.classes[slotIndex]
  return characterCards.value.find(c => c.cardType === type && normalizeClassName(c.className) === cls)
}

function getSubmissionsOnLeyline(leyId) {
  const out = []
  roundInfo.value.classes.forEach((cls, idx) => {
    // servant
    if (servantLeylineIds.value[idx] == leyId) {
      const code = servantCodes.value[idx] || '-'
      const action = servantActions.value[idx] || ''
      if (action) out.push(`${code}: ${action}`)
    }
    // master
    if (masterLeylineIds.value[idx] == leyId) {
      const code = masterCodes.value[idx] || '-'
      const action = masterActions.value[idx] || ''
      if (action) out.push(`${code}: ${action}`)
    }
  })
  return out
}

async function saveAllAssignments() {
  if (!campaignId.value) {
    alert('请先选择战役')
    return
  }
  assignmentSaving.value = true
  try {
    const items = []
    roundInfo.value.classes.forEach((cls, idx) => {
      const servantCard = characterCards.value.find(c => c.cardType === 'SERVANT' && normalizeClassName(c.className) === cls)
      if (servantCard) {
        items.push({ characterCardId: servantCard.id, leylineId: servantLeylineIds.value[idx] ?? null })
      }
      const masterCard = characterCards.value.find(c => c.cardType === 'MASTER' && normalizeClassName(c.className) === cls)
      if (masterCard) {
        items.push({ characterCardId: masterCard.id, leylineId: masterLeylineIds.value[idx] ?? null })
      }
    })
    await assignLeylineBulk(campaignId.value, items)
    console.log('saveAllAssignments sent items:', items)
    // Immediately reflect assignments in UI so user doesn't see temporary "无"
    try {
      items.forEach(it => {
        const card = characterCards.value.find(c => c.id === it.characterCardId)
        if (!card) return
        const cls = normalizeClassName(card.className)
        const idx = roundInfo.value.classes.indexOf(cls)
        if (idx === -1) return
        if (card.cardType === 'SERVANT') {
          servantLeylineIds.value[idx] = it.leylineId ?? null
        } else if (card.cardType === 'MASTER') {
          masterLeylineIds.value[idx] = it.leylineId ?? null
        }
      })
    } catch (e) {
      console.error('applyImmediateAssignments failed:', e)
    }
    // Refresh from server to ensure persisted state is consistent
    await loadLeylines()
    alert('已保存所有指派')
  } catch (err) {
    console.error('批量保存指派失败:', err)
    alert('保存失败：' + (err.message || err))
  } finally {
    assignmentSaving.value = false
  }
}

async function retireCharacter(slotIndex, type) {
  if (!campaignId.value) {
    alert('请先选择战役')
    return
  }
  const cls = roundInfo.value.classes[slotIndex]
  const card = characterCards.value.find(c => c.cardType === type && normalizeClassName(c.className) === cls)
  if (!card) {
    alert('未找到对应的角色卡，无法退场。')
    return
  }

  try {
    // remove assignment for this character
    await assignLeylineBulk(campaignId.value, [{ characterCardId: card.id, leylineId: null }])
  } catch (err) {
    console.error('取消指派失败:', err)
  }
  try {
    // soft-retire via API
    await retireCharacterCard(card.id)
    card.retired = true
    // clear local assignment
    if (type === 'SERVANT') {
      servantLeylineIds.value[slotIndex] = null
      servantDeathsCount.value = servantDeathsCount.value + 1
    } else {
      masterLeylineIds.value[slotIndex] = null
      masterDeathsCount.value = masterDeathsCount.value + 1
    }
    // reload leylines to reflect persistence
    await loadLeylines()
    alert('已退场（已标记）')
  } catch (err) {
    console.error('退场失败:', err)
    alert('退场失败: ' + (err.message || err))
  }
}

async function /* removed duplicate */__resummon_placeholder(slotIndex, type) { /* duplicate removed */ }
// update death counts when resummoning
async function resummonCharacter(slotIndex, type) {
  if (!campaignId.value) {
    alert('请先选择战役')
    return
  }
  const cls = roundInfo.value.classes[slotIndex]
  const card = characterCards.value.find(c => c.cardType === type && normalizeClassName(c.className) === cls)
  if (!card) {
    alert('未找到对应的角色卡，无法返场。')
    return
  }
  try {
    await unretireCharacterCard(card.id)
    card.retired = false
    // adjust counts
    if (type === 'SERVANT') {
      servantDeathsCount.value = Math.max(0, servantDeathsCount.value - 1)
    } else {
      masterDeathsCount.value = Math.max(0, masterDeathsCount.value - 1)
    }
    // reload leylines to refresh UI
    await loadLeylines()
    alert('已返场')
  } catch (err) {
    console.error('返场失败:', err)
    alert('返场失败: ' + (err.message || err))
  }
}

// 更新角色状态（魔力、令咒、异常状态等）
async function updateCharacterMana(slotIndex, type, newValue, immediate = false) {
  if (!campaignId.value) {
    console.warn('未选择战役，无法更新状态')
    return
  }

  // 数据验证
  const parsedValue = parseInt(newValue)
  if (isNaN(parsedValue) || parsedValue < 0) {
    console.warn('无效的魔力值:', newValue)
    // 恢复到之前的值
    await loadCharacterStatuses()
    return
  }

  const cls = roundInfo.value.classes[slotIndex]
  const card = characterCards.value.find(c => c.cardType === type && normalizeClassName(c.className) === cls)
  if (!card) {
    console.warn('未找到对应的角色卡，无法更新状态')
    return
  }

  // 生成唯一键来跟踪这个字段的状态
  const fieldKey = `${card.id}-${type}-mana`

  // 乐观更新UI
  const oldValue = type === 'SERVANT' ? roundInfo.value.servantMana[slotIndex] : roundInfo.value.masterMana[slotIndex]

  // 临时更新UI
  if (type === 'SERVANT') {
    roundInfo.value.servantMana[slotIndex] = parsedValue
  } else if (type === 'MASTER') {
    roundInfo.value.masterMana[slotIndex] = parsedValue
  }

  if (immediate) {
    // 立即保存
    try {
      await performManaAutoSave(card.id, slotIndex, type, parsedValue, oldValue)
      // 取消自动保存（如果有的话）
      const existingState = autoSaveStates.get(fieldKey)
      if (existingState && existingState.timer) {
        clearTimeout(existingState.timer)
        autoSaveStates.delete(fieldKey)
      }
    } catch (err) {
      // 错误已经在performManaAutoSave中处理了
    }
  } else {
    // 设置自动保存
    scheduleAutoSave(fieldKey, async () => {
      await performManaAutoSave(card.id, slotIndex, type, parsedValue, oldValue)
    })
  }
}

// 定时自动保存 - 支持每个字段独立保存
function scheduleAutoSave(fieldKey, saveFunction) {
  // 清除此字段之前的定时器
  const existingState = autoSaveStates.get(fieldKey)
  if (existingState && existingState.timer) {
    clearTimeout(existingState.timer)
  }

  // 设置新的定时器
  const timer = setTimeout(async () => {
    // 标记为正在保存
    autoSaveStates.set(fieldKey, { saving: true, timer: null })

    try {
      await saveFunction()
      // 保存成功，清理状态
      autoSaveStates.delete(fieldKey)
    } catch (err) {
      // 保存失败，清理状态
      autoSaveStates.delete(fieldKey)
      throw err // 重新抛出错误，让调用方处理
    }
  }, AUTO_SAVE_DELAY)

  // 保存状态
  autoSaveStates.set(fieldKey, { saving: false, timer })
}

// 执行魔力自动保存
async function performManaAutoSave(characterCardId, slotIndex, type, newValue, oldValue) {
  const fieldKey = `${characterCardId}-${type}-mana`
  const indicatorKey = `${type}-mana-${slotIndex}`

  try {
    // 设置保存中状态
    saveIndicators.value.set(indicatorKey, 'saving')

    const card = characterCards.value.find(c => c.id === characterCardId)
    if (!card) {
      saveIndicators.value.set(indicatorKey, 'error')
      return
    }

    const statusData = {
      characterCardId: card.id,
      campaignId: campaignId.value,
      roundNumber: currentTurn.value,
      currentMana: newValue,
    }

    // 如果是御主，还需要包含令咒数量
    if (type === 'MASTER') {
      statusData.currentCommandSeals = roundInfo.value.commandSeals[slotIndex]
    }

    const result = await updateCharacterStatus(statusData)

    // 更新本地状态缓存
    characterStatuses.value.set(card.id, result)

    // 设置保存成功状态
    saveIndicators.value.set(indicatorKey, 'saved')

    // 3秒后清除成功状态
    setTimeout(() => {
      saveIndicators.value.delete(indicatorKey)
    }, 3000)

    console.log(`角色${type === 'SERVANT' ? '从者' : '御主'}魔力自动保存成功:`, newValue)
  } catch (err) {
    console.error('魔力自动保存失败:', err)

    // 设置错误状态
    saveIndicators.value.set(indicatorKey, 'error')

    // 恢复原始值
    if (type === 'SERVANT') {
      roundInfo.value.servantMana[slotIndex] = oldValue
    } else if (type === 'MASTER') {
      roundInfo.value.masterMana[slotIndex] = oldValue
    }

    // 3秒后清除错误状态
    setTimeout(() => {
      saveIndicators.value.delete(indicatorKey)
    }, 3000)

    console.error('魔力数据已恢复到上一个有效状态')
    throw err // 重新抛出错误
  }
}

// 更新令咒数量
async function updateCommandSeals(slotIndex, newValue, immediate = false) {
  if (!campaignId.value) {
    console.warn('未选择战役，无法更新令咒')
    return
  }

  // 数据验证
  const parsedValue = parseInt(newValue)
  if (isNaN(parsedValue) || parsedValue < 0 || parsedValue > 3) {
    console.warn('无效的令咒数量:', newValue, '必须在0-3之间')
    // 恢复到之前的值
    await loadCharacterStatuses()
    return
  }

  const cls = roundInfo.value.classes[slotIndex]
  const card = characterCards.value.find(c => c.cardType === 'MASTER' && normalizeClassName(c.className) === cls)
  if (!card) {
    console.warn('未找到对应的御主角色卡，无法更新令咒')
    return
  }

  // 生成唯一键来跟踪这个字段的状态
  const fieldKey = `${card.id}-command-seals`

  // 乐观更新UI
  const oldValue = roundInfo.value.commandSeals[slotIndex]

  // 临时更新UI
  roundInfo.value.commandSeals[slotIndex] = parsedValue

  if (immediate) {
    // 立即保存
    try {
      await performCommandSealsAutoSave(card.id, slotIndex, parsedValue, oldValue)
      // 取消自动保存（如果有的话）
      const existingState = autoSaveStates.get(fieldKey)
      if (existingState && existingState.timer) {
        clearTimeout(existingState.timer)
        autoSaveStates.delete(fieldKey)
      }
    } catch (err) {
      // 错误已经在performCommandSealsAutoSave中处理了
    }
  } else {
    // 设置自动保存
    scheduleAutoSave(fieldKey, async () => {
      await performCommandSealsAutoSave(card.id, slotIndex, parsedValue, oldValue)
    })
  }
}

// 执行令咒自动保存
async function performCommandSealsAutoSave(characterCardId, slotIndex, newValue, oldValue) {
  const fieldKey = `${characterCardId}-command-seals`
  const indicatorKey = `command-seals-${slotIndex}`

  try {
    // 设置保存中状态
    saveIndicators.value.set(indicatorKey, 'saving')

    const card = characterCards.value.find(c => c.id === characterCardId)
    if (!card) {
      saveIndicators.value.set(indicatorKey, 'error')
      return
    }

    const statusData = {
      characterCardId: card.id,
      campaignId: campaignId.value,
      roundNumber: currentTurn.value,
      currentMana: roundInfo.value.masterMana[slotIndex],
      currentCommandSeals: newValue,
    }

    const result = await updateCharacterStatus(statusData)

    // 更新本地状态缓存
    characterStatuses.value.set(card.id, result)

    // 设置保存成功状态
    saveIndicators.value.set(indicatorKey, 'saved')

    // 3秒后清除成功状态
    setTimeout(() => {
      saveIndicators.value.delete(indicatorKey)
    }, 3000)

    console.log('令咒数量自动保存成功:', newValue)
  } catch (err) {
    console.error('令咒自动保存失败:', err)

    // 设置错误状态
    saveIndicators.value.set(indicatorKey, 'error')

    // 恢复原始值
    roundInfo.value.commandSeals[slotIndex] = oldValue

    // 3秒后清除错误状态
    setTimeout(() => {
      saveIndicators.value.delete(indicatorKey)
    }, 3000)

    console.error('令咒数据已恢复到上一个有效状态')
    throw err // 重新抛出错误
  }
}

// 更新异常状态
async function updateStatusEffects(slotIndex, newEffects, immediate = false) {
  if (!campaignId.value) {
    console.warn('未选择战役，无法更新异常状态')
    return
  }

  const cls = roundInfo.value.classes[slotIndex]
  const card = characterCards.value.find(c =>
    normalizeClassName(c.className) === cls &&
    (c.cardType === 'SERVANT' || c.cardType === 'MASTER')
  )
  if (!card) {
    console.warn('未找到对应的角色卡，无法更新异常状态')
    return
  }

  // 生成唯一键来跟踪这个字段的状态
  const fieldKey = `${card.id}-status-effects`

  // 乐观更新UI
  const oldEffects = [...roundInfo.value.statusEffects[slotIndex]]

  // 临时更新UI
  roundInfo.value.statusEffects[slotIndex] = [...newEffects]

  if (immediate) {
    // 立即保存
    try {
      await performStatusEffectsAutoSave(card.id, slotIndex, newEffects, oldEffects)
      // 取消自动保存（如果有的话）
      const existingState = autoSaveStates.get(fieldKey)
      if (existingState && existingState.timer) {
        clearTimeout(existingState.timer)
        autoSaveStates.delete(fieldKey)
      }
    } catch (err) {
      // 错误已经在performStatusEffectsAutoSave中处理了
    }
  } else {
    // 设置自动保存
    scheduleAutoSave(fieldKey, async () => {
      await performStatusEffectsAutoSave(card.id, slotIndex, newEffects, oldEffects)
    })
  }
}

// 执行异常状态自动保存
async function performStatusEffectsAutoSave(characterCardId, slotIndex, newEffects, oldEffects) {
  const fieldKey = `${characterCardId}-status-effects`
  const indicatorKey = `status-effects-${slotIndex}`

  try {
    // 设置保存中状态
    saveIndicators.value.set(indicatorKey, 'saving')

    const card = characterCards.value.find(c => c.id === characterCardId)
    if (!card) {
      saveIndicators.value.set(indicatorKey, 'error')
      return
    }

    // 获取当前魔力和令咒数据
    const currentMana = card.cardType === 'SERVANT'
      ? roundInfo.value.servantMana[slotIndex]
      : roundInfo.value.masterMana[slotIndex]
    const currentCommandSeals = card.cardType === 'MASTER'
      ? roundInfo.value.commandSeals[slotIndex]
      : null

    const statusData = {
      characterCardId: card.id,
      campaignId: campaignId.value,
      roundNumber: currentTurn.value,
      currentMana: currentMana,
      statusEffectsList: newEffects,
    }

    if (currentCommandSeals !== null) {
      statusData.currentCommandSeals = currentCommandSeals
    }

    const result = await updateCharacterStatus(statusData)

    // 更新本地状态缓存
    characterStatuses.value.set(card.id, result)

    // 设置保存成功状态
    saveIndicators.value.set(indicatorKey, 'saved')

    // 3秒后清除成功状态
    setTimeout(() => {
      saveIndicators.value.delete(indicatorKey)
    }, 3000)

    console.log('异常状态自动保存成功:', newEffects)
  } catch (err) {
    console.error('异常状态自动保存失败:', err)

    // 设置错误状态
    saveIndicators.value.set(indicatorKey, 'error')

    // 恢复原始值
    roundInfo.value.statusEffects[slotIndex] = [...oldEffects]

    // 3秒后清除错误状态
    setTimeout(() => {
      saveIndicators.value.delete(indicatorKey)
    }, 3000)

    console.error('异常状态数据已恢复到上一个有效状态')
    throw err // 重新抛出错误
  }
}

// 关闭行动提交
async function closeActions() {
  if (!campaignId.value) {
    alert('请先选择一个战役')
    return
  }
  try {
    // prepare snapshot payload
    const payload = {
      actionOrder: JSON.parse(JSON.stringify(actionOrder.value || [])),
      servantActions: JSON.parse(JSON.stringify(servantActions.value || [])),
      masterActions: JSON.parse(JSON.stringify(masterActions.value || [])),
    }
    const res = await closeCurrentRound(campaignId.value, payload)
    // refresh persisted history from server
    try {
      const history = await listRoundHistory(campaignId.value)
      historyActions.value = history || []
    } catch (e) {
      console.error('刷新历史记录失败', e)
    }
    // clear current displayed submissions and action order for next round
    servantActions.value = new Array(roundInfo.value.classes.length).fill(null)
    masterActions.value = new Array(roundInfo.value.classes.length).fill(null)
    resetActionOrderActions()
    alert('已关闭当前回合的行动提交；历史记录已保存')
  } catch (err) {
    alert('关闭失败: ' + err.message)
  }
}

// 进入下一回合
async function nextTurn() {
  if (currentTurn.value >= totalTurns.value) {
    alert('战役已结束')
    return
  }
  if (!campaignId.value) {
    alert('请先选择战役')
    return
  }
  try {
    const res = await createNextRound(campaignId.value)
    if (res && res.round && res.round.turnNumber != null) {
      currentTurn.value = Number(res.round.turnNumber)
      progress.value = progressPercent.value
      // clear current submissions for new round
      servantActions.value = new Array(roundInfo.value.classes.length).fill(null)
      masterActions.value = new Array(roundInfo.value.classes.length).fill(null)
      resetActionOrderActions()
      // 重新加载角色状态
      await loadCharacterStatuses()
      alert(`进入第 ${currentTurn.value} 回合`)
    } else {
      alert('进入下一回合失败：服务器未返回回合信息')
    }
  } catch (err) {
    alert('进入下一回合失败: ' + err.message)
  }
}

onMounted(async () => {
  await loadCampaigns()
  // initial load and setup SSE (loadCampaigns will call connectActionSSE after selecting a campaign)
  await loadActionSubmissions()
  // 确保在页面刷新时所有状态都能正确恢复
  if (campaignId.value) {
    await ensureDataConsistency()
  }
})

// 确保数据一致性，特别是在页面刷新时
async function ensureDataConsistency() {
  try {
    // 重新加载所有相关数据，确保与后端同步
    await loadCharacterCards()
    await loadLeylines()
    await loadActionSubmissions()
    await loadCharacterStatuses()
    console.log('数据一致性检查完成')
  } catch (err) {
    console.error('数据一致性检查失败:', err)
    // 即使检查失败，也要尝试重置状态
    resetRoundInfoToDefaults()
  }
}

onBeforeUnmount(() => {
  // 清除所有自动保存定时器
  for (const [fieldKey, state] of autoSaveStates) {
    if (state.timer) {
      clearTimeout(state.timer)
    }
  }
  autoSaveStates.clear()
  // no-op: using manual refresh for submissions
})
</script>

<template>
  <section class="battle-control">
    <!-- 战役管理部分 -->
    <div class="campaign-management">
      <h1 class="page-title">战役管理控制台</h1>

      <!-- 统计卡片区域 -->
      <div class="stats-grid">
        <div class="stat-card">
          <h3 class="stat-label">活跃战役</h3>
          <div class="stat-value stat-blue">{{ stats.active }}</div>
        </div>
        <div class="stat-card">
          <h3 class="stat-label">已完成战役</h3>
          <div class="stat-value stat-green">{{ stats.completed }}</div>
        </div>
        <div class="stat-card">
          <h3 class="stat-label">总战役数</h3>
          <div class="stat-value stat-purple">{{ stats.total }}</div>
        </div>
        <div class="stat-card">
          <h3 class="stat-label">平均持续时间</h3>
          <div class="stat-value stat-orange">-</div>
        </div>
      </div>

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
    </div>

    <!-- 战斗控制部分（仅在有选择战役时显示） -->
    <div v-if="campaignId" class="battle-control-section">
      <!-- 页面标题区域 -->
      <div class="card">
        <div class="card-body text-center">
          <h2 class="section-title">圣杯战争战役控制界面</h2>
          <p class="campaign-info">
            战役ID：{{ campaignId }} ｜ 
            战役名称：{{ campaignName || '未选择战役' }} ｜ 
            当前回合：{{ currentTurnLabel }}（第{{ currentTurn }}回合） ｜ 
            圣杯规模：{{ holyGrailScale }} （{{ holyGrailTier }}）
            <small><i>（每个从者退场 +1；每2个御主退场 +1）</i></small>
          </p>
        </div>
      </div>

      <!-- 战斗控制区域 -->
      <section class="card">
        <div class="card-header">
          <h2 class="card-title">战斗控制</h2>
        </div>
        <div class="card-body">
          <p>Fate GM助手 - 战斗流程管理</p>
          
          <!-- 控制按钮 -->
          <div class="control-actions">
            <button class="btn btn-warning" @click="closeActions">关闭行动提交</button>
            <button class="btn btn-primary" @click="nextTurn">进入下一回合</button>
          </div>
        </div>
      </section>

      <!-- 战役进度条 -->
      <div class="progress-container">
        <h3>战役进度</h3>
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

      <!-- 灵脉总览 -->
      <div class="leyline-summary-card" v-if="leylines && leylines.length">
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">本战役灵脉一览</h2>
          </div>
          <div class="card-body">
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

      <!-- 灵脉管理完整面板（从技能记录迁移） -->
      <section class="card" v-if="campaignId">
        <div class="card-header">
          <h2 class="card-title">灵脉管理（战役专用）</h2>
          <div class="card-actions">
            <button class="btn btn-secondary" @click="addLeyline">新建灵脉</button>
          </div>
        </div>
        <div class="card-body leyline-layout">
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

      <!-- 当前回合信息表 -->
      <div class="table-container">
        <div style="display:flex;align-items:center;justify-content:space-between;">
        <h2>当前回合信息表</h2>
          <div>
            <button class="btn btn-primary" :disabled="assignmentSaving" @click="saveAllAssignments">
              {{ assignmentSaving ? '保存中...' : '保存指派' }}
            </button>
            <button class="btn btn-secondary" style="margin-left:0.5rem;" @click="loadActionSubmissions">刷新提交</button>
          </div>
        </div>
        <div class="table-wrapper">
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
            </tbody>
          </table>
        </div>
      </div>

      <!-- 行动排序表格 -->
      <div class="table-container">
        <h2>当前回合行动顺序</h2>
        <div class="table-wrapper">
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
    
    <!-- 固定行动记录表（跳伞 + 第1~14天昼夜） -->
    <div class="table-container" style="margin-top:1rem;">
      <h2>行动记录</h2>
      <div class="table-wrapper">
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
  </section>
</template>

<style scoped>
.battle-control {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.campaign-management {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.battle-control-section {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 2px solid var(--color-border);
}

.no-campaign-hint {
  text-align: center;
  padding: 3rem;
  color: var(--color-text-secondary);
  font-size: 1.1rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.stat-card {
  background: white;
  border-radius: 0.75rem;
  padding: 1.5rem;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
}

.stat-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: 0.5rem;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  margin-top: 0.5rem;
}

.stat-blue {
  color: #2563eb;
}

.stat-green {
  color: #16a34a;
}

.stat-purple {
  color: #7c3aed;
}

.stat-orange {
  color: #ea580c;
}

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

.search-create-bar {
  display: flex;
  gap: 1rem;
  align-items: center;
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

.progress-container {
  background: white;
  padding: 1.5rem;
  border-radius: 0.75rem;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  border: 1px solid var(--color-border);
}

.progress-container h3 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: var(--color-text-primary);
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
</style>
