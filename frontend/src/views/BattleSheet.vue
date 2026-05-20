<script setup>
import { ref, computed, onMounted } from 'vue'
import { usePersistedRef } from '../composables/usePersistedRef'

// ---- 持久化状态（刷新后自动恢复） ----
const selectedCampaignId = usePersistedRef('battle-sheet:campaignId', '')
const selectedLeylineId = usePersistedRef('battle-sheet:leylineId', '')
const positions = usePersistedRef('battle-sheet:positions', 3)
const redTeam = usePersistedRef('battle-sheet:redTeam', ['', '', '', '', '', ''])
const blueTeam = usePersistedRef('battle-sheet:blueTeam', ['', '', '', '', '', ''])

// ---- 非持久化状态 ----
const campaigns = ref([])
const leylines = ref([])
const characters = ref([])
const loading = ref(false)

// 动态生成战斗位名称：第一个是主力位，最后一个是支援位，中间全部是辅助位
const positionNames = computed(() => {
  const n = positions.value
  if (n <= 1) return ['主力位']
  const result = ['主力位']
  for (let i = 1; i < n - 1; i++) result.push('辅助位')
  result.push('支援位')
  return result
})

const stats = ['等级', '筋力', '耐力', '敏捷', '魔力', '幸运', '宝具']

const selectedLeyline = computed(() => {
  if (!selectedLeylineId.value) return null
  return leylines.value.find(l => l.id === parseInt(selectedLeylineId.value))
})

// ---- API 调用 ----
async function fetchCampaigns() {
  try {
    const res = await fetch('/api/campaigns')
    if (res.ok) campaigns.value = await res.json()
  } catch (err) {
    console.error('获取战役列表失败:', err)
  }
}

async function fetchLeylines(campaignId) {
  try {
    const res = await fetch(`/api/leylines?campaignId=${campaignId}`)
    if (res.ok) leylines.value = await res.json()
  } catch (err) {
    console.error('获取灵脉列表失败:', err)
  }
}

async function fetchCharacters(campaignId) {
  loading.value = true
  try {
    const res = await fetch(`/api/character-cards?campaignId=${campaignId}&size=200`)
    if (res.ok) {
      const data = await res.json()
      characters.value = data.content || data
    }
  } catch (err) {
    console.error('获取角色列表失败:', err)
  } finally {
    loading.value = false
  }
}

async function onCampaignChange() {
  selectedLeylineId.value = ''
  leylines.value = []
  characters.value = []
  if (selectedCampaignId.value) {
    await fetchLeylines(selectedCampaignId.value)
    await fetchCharacters(selectedCampaignId.value)
  }
}

function onCharacterSelect(team, index, event) {
  const value = event.target.value
  if (team === 'red') {
    // 创建新数组触发响应式（usePersistedRef 需要整体替换才能触发 watch）
    const newArr = [...redTeam.value]
    newArr[index] = value
    redTeam.value = newArr
  } else {
    const newArr = [...blueTeam.value]
    newArr[index] = value
    blueTeam.value = newArr
  }
}

function getCharacterStat(charId, statName) {
  const char = characters.value.find(c => c.id === parseInt(charId))
  if (!char) return ''
  const statMap = {
    '等级': 'level', '筋力': 'strength', '耐力': 'endurance',
    '敏捷': 'agility', '魔力': 'mana', '幸运': 'luck', '宝具': 'noblePhantasm'
  }
  const key = statMap[statName]
  return (key && char.totalStats && char.totalStats[key] !== undefined)
    ? char.totalStats[key]
    : ''
}

function calculateTotal(team, statName) {
  const teamData = team === 'red' ? redTeam.value : blueTeam.value
  const statMap = {
    '等级': 'level', '筋力': 'strength', '耐力': 'endurance',
    '敏捷': 'agility', '魔力': 'mana', '幸运': 'luck', '宝具': 'noblePhantasm'
  }
  const key = statMap[statName]
  let total = 0
  teamData.forEach((charId, i) => {
    if (!charId) return
    const char = characters.value.find(c => c.id === parseInt(charId))
    if (!char || !char.totalStats || char.totalStats[key] === undefined) return
    const val = char.totalStats[key]
    const posName = positionNames.value[i]
    if (posName === '主力位' || posName === '支援位') total += val
    else total += Math.floor(val / 2)
  })
  return total
}

onMounted(async () => {
  await fetchCampaigns()
  // 如果已持久化了战役ID，自动加载对应数据
  if (selectedCampaignId.value) {
    await fetchLeylines(selectedCampaignId.value)
    await fetchCharacters(selectedCampaignId.value)
  }
})
</script>

<template>
  <section class="page-card">
    <div class="page-head">
      <div>
        <h1 class="page-title">战斗表格</h1>
        <p class="page-subtitle">选择战役和灵脉，配置红蓝双方参战人员，自动计算属性合计</p>
      </div>
    </div>

    <!-- 选择器 -->
    <div class="selector-bar">
      <div class="selector-item">
        <label>战役</label>
        <select v-model="selectedCampaignId" @change="onCampaignChange">
          <option value="">-- 选择战役 --</option>
          <option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>
      <div class="selector-item" v-if="selectedCampaignId">
        <label>灵脉</label>
        <select v-model="selectedLeylineId">
          <option value="">-- 选择灵脉 --</option>
          <option v-for="l in leylines" :key="l.id" :value="l.id">{{ l.name }}</option>
        </select>
      </div>
      <div class="selector-item selector-positions">
        <label>战斗位数量</label>
        <div class="positions-control">
          <button @click="positions > 3 ? positions-- : null" :disabled="positions <= 3">−</button>
          <span class="positions-num">{{ positions }}</span>
          <button @click="positions < 6 ? positions++ : null" :disabled="positions >= 6">+</button>
        </div>
      </div>
    </div>

    <!-- 灵脉信息 -->
    <div v-if="selectedLeyline && selectedLeylineId" class="leyline-card">
      <div class="leyline-header">{{ selectedLeyline.name }}</div>
      <div class="leyline-stats">
        <div class="leyline-stat">
          <span class="leyline-stat-label">战场宽度</span>
          <span class="leyline-stat-value">{{ selectedLeyline.battlefieldWidth }}</span>
        </div>
        <div class="leyline-stat">
          <span class="leyline-stat-label">人流量</span>
          <span class="leyline-stat-value">{{ selectedLeyline.populationFlow }}</span>
        </div>
        <div class="leyline-stat" v-if="selectedLeyline.assignedCharacterIds?.length">
          <span class="leyline-stat-label">驻留角色</span>
          <span class="leyline-stat-value">{{ selectedLeyline.assignedCharacterIds.join(', ') }}</span>
        </div>
      </div>
    </div>

    <!-- 战斗表格 -->
    <div v-if="selectedCampaignId && characters.length" class="table-container">
      <table class="battle-table">
        <thead>
          <tr>
            <th class="col-label"></th>
            <th :colspan="positions + 1" class="team-header red-header">🔴 红方</th>
            <th :colspan="positions + 1" class="team-header blue-header">🔵 蓝方</th>
          </tr>
          <tr>
            <th class="col-label"></th>
            <th v-for="(name, i) in positionNames" :key="'rh-'+i" class="col-pos">{{ name }}</th>
            <th class="col-total red-total">合计</th>
            <th v-for="(name, i) in positionNames" :key="'bh-'+i" class="col-pos">{{ name }}</th>
            <th class="col-total blue-total">合计</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="col-label">参战人员</td>
            <td v-for="(_, i) in positionNames" :key="'rp-'+i">
              <select
                :value="redTeam[i]"
                @change="e => onCharacterSelect('red', i, e)"
                class="char-select"
              >
                <option value="">--</option>
                <option v-for="c in characters" :key="'rr-'+c.id" :value="c.id">{{ c.code }}</option>
              </select>
            </td>
            <td class="col-total"></td>
            <td v-for="(_, i) in positionNames" :key="'bp-'+i">
              <select
                :value="blueTeam[i]"
                @change="e => onCharacterSelect('blue', i, e)"
                class="char-select"
              >
                <option value="">--</option>
                <option v-for="c in characters" :key="'br-'+c.id" :value="c.id">{{ c.code }}</option>
              </select>
            </td>
            <td class="col-total"></td>
          </tr>
          <tr v-for="statName in stats" :key="statName" class="stat-row">
            <td class="col-label">{{ statName }}</td>
            <td v-for="(_, i) in positionNames" :key="'rs-'+i" class="col-stat">
              {{ redTeam[i] ? getCharacterStat(redTeam[i], statName) : '' }}
            </td>
            <td class="col-total red-total">{{ calculateTotal('red', statName) }}</td>
            <td v-for="(_, i) in positionNames" :key="'bs-'+i" class="col-stat">
              {{ blueTeam[i] ? getCharacterStat(blueTeam[i], statName) : '' }}
            </td>
            <td class="col-total blue-total">{{ calculateTotal('blue', statName) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 未选择战役时的占位提示 -->
    <div v-else-if="!selectedCampaignId" class="empty-hint">
      请先选择一个战役，然后选择灵脉查看战斗表格
    </div>
    <div v-else-if="loading" class="empty-hint">加载角色列表中...</div>
    <div v-else class="empty-hint">该战役暂无角色卡，请先上传角色卡</div>
  </section>
</template>

<style scoped>
.page-head {
  margin-bottom: 1rem;
}

/* ---- 选择器栏 ---- */
.selector-bar {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  align-items: flex-end;
  padding: 0.75rem 1rem;
  background: #f8f9ff;
  border: 1px solid #e8ecf8;
  border-radius: 0.75rem;
  margin-bottom: 1rem;
}
.selector-item {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.selector-item label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.selector-item select {
  min-width: 180px;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.5rem 0.7rem;
  font-size: 0.95rem;
  background: #fff;
}
.positions-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.positions-control button {
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: #fff;
  font-size: 1.2rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.positions-control button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.positions-num {
  font-size: 1.1rem;
  font-weight: 700;
  min-width: 1.5rem;
  text-align: center;
}

/* ---- 灵脉信息卡片 ---- */
.leyline-card {
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  overflow: hidden;
  margin-bottom: 1rem;
}
.leyline-header {
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-weight: 700;
  font-size: 0.95rem;
}
.leyline-stats {
  display: flex;
  gap: 1.5rem;
  padding: 0.6rem 1rem;
  background: #f8f9ff;
}
.leyline-stat {
  display: flex;
  gap: 0.4rem;
  font-size: 0.9rem;
}
.leyline-stat-label {
  color: #888;
}
.leyline-stat-value {
  font-weight: 600;
}

/* ---- 战斗表格 ---- */
.table-container {
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  overflow: hidden;
}
.battle-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.battle-table th,
.battle-table td {
  padding: 0.5rem 0.4rem;
  text-align: center;
  border-bottom: 1px solid #eee;
}
.col-label {
  background: #f0f0f0;
  font-weight: 700;
  text-align: left !important;
  padding-left: 0.75rem !important;
  min-width: 80px;
}
.col-pos {
  background: #f8f8f8;
  font-weight: 600;
  font-size: 0.8rem;
}
.col-stat {
  background: #fff;
}
.battle-table tbody tr:hover td {
  background: #f8f5ff;
}
/* 团队表头颜色 */
.team-header {
  font-size: 1rem;
  font-weight: 700;
  padding: 0.6rem;
}
.red-header { background: #ffebee; color: #c62828; }
.blue-header { background: #e3f2fd; color: #1565c0; }
.red-total { background: #fff5f5; font-weight: 700; color: #c62828; }
.blue-total { background: #f5f9ff; font-weight: 700; color: #1565c0; }

.char-select {
  width: 100%;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  padding: 0.35rem 0.3rem;
  font-size: 0.82rem;
  background: #fff;
}

/* ---- 占位提示 ---- */
.empty-hint {
  padding: 2rem;
  text-align: center;
  color: #999;
  border: 2px dashed #d0d0d0;
  border-radius: 0.75rem;
  font-size: 0.95rem;
}
</style>
