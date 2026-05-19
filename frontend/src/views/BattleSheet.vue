<template>
  <section class="battle-sheet">
    <div class="battle-selector">
      <div class="campaign-select">
        <label for="campaign-select">选择战役：</label>
        <select id="campaign-select" v-model="selectedCampaignId" @change="onCampaignChange">
          <option value="">未打开战役</option>
          <option v-for="campaign in campaigns" :key="campaign.id" :value="campaign.id">
            {{ campaign.name }}
          </option>
        </select>
      </div>
      <div class="location-select" v-if="selectedCampaignId">
        <label for="location-select">选择灵脉：</label>
        <select id="location-select" v-model="selectedLeylineId" @change="onLeylineChange">
          <option value="">请选择灵脉...</option>
          <option v-for="leyline in leylines" :key="leyline.id" :value="leyline.id">
            {{ leyline.name }}
          </option>
        </select>
      </div>
    </div>
    <div class="leyline-info" v-if="selectedLeyline && selectedLeylineId">
      <h2>灵脉信息</h2>
      <div class="info-item">
        <span class="label">灵脉名称：</span>
        <span class="value">{{ selectedLeyline.name }}</span>
      </div>
      <div class="info-item">
        <span class="label">战场宽度：</span>
        <span class="value">{{ selectedLeyline.battlefieldWidth }}</span>
      </div>
      <div class="info-item">
        <span class="label">人流量：</span>
        <span class="value">{{ selectedLeyline.populationFlow }}</span>
      </div>
      <div class="info-item" v-if="selectedLeyline.assignedCharacterIds && selectedLeyline.assignedCharacterIds.length > 0">
        <span class="label">该灵脉的人：</span>
        <span class="value">{{ selectedLeyline.assignedCharacterIds.join(', ') }}</span>
      </div>
    </div>
    <div class="battle-table-controls">
      <button @click="addPosition">+ 添加战斗位</button>
      <button @click="removePosition" :disabled="positions <= 3">- 删除战斗位</button>
    </div>
    <h1>战斗表格</h1>
    <table class="battle-table">
      <thead>
        <tr>
          <td></td>
          <th :colspan="positions + 1" class="red-team">红方</th>
          <th :colspan="positions + 1" class="blue-team">蓝方</th>
        </tr>
        <tr>
          <td></td>
          <th v-for="(pos, index) in positionNames" :key="'red-'+index">{{ pos }}</th>
          <th class="red-team">合计</th>
          <th v-for="(pos, index) in positionNames" :key="'blue-'+index">{{ pos }}</th>
          <th class="blue-team">合计</th>
        </tr>
        <tr>
          <th>参战人员</th>
          <td v-for="(pos, index) in positionNames" :key="'red-cell-'+index">
            <select v-model="redTeam[index]" @change="onCharacterSelect($event, 'red', index)">
              <option value="">请选择角色</option>
              <option v-for="char in characters" :key="char.id" :value="char.id">
                {{ char.code }}
              </option>
            </select>
          </td>
          <td class="red-team"></td>
          <td v-for="(pos, index) in positionNames" :key="'blue-cell-'+index">
            <select v-model="blueTeam[index]" @change="onCharacterSelect($event, 'blue', index)">
              <option value="">请选择角色</option>
              <option v-for="char in characters" :key="char.id" :value="char.id">
                {{ char.code }}
              </option>
            </select>
          </td>
          <td class="blue-team"></td>
        </tr>
        <tr v-for="stat in stats" :key="stat">
          <td class="row-label">{{ stat }}</td>
          <td v-for="(pos, index) in positionNames" :key="'red-stat-'+index">
            <div v-if="redTeam[index]">
              {{ getCharacterStat(redTeam[index], stat) }}
            </div>
          </td>
          <td class="red-team">
            <div v-if="redTeam.some(id => id)">
              {{ calculateTotal('red', stat) }}
            </div>
          </td>
          <td v-for="(pos, index) in positionNames" :key="'blue-stat-'+index">
            <div v-if="blueTeam[index]">
              {{ getCharacterStat(blueTeam[index], stat) }}
            </div>
          </td>
          <td class="blue-team">
            <div v-if="blueTeam.some(id => id)">
              {{ calculateTotal('blue', stat) }}
            </div>
          </td>
        </tr>
      </thead>
    </table>
  </section>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'

const campaigns = ref([])
const leylines = ref([])
const characters = ref([])
const selectedCampaignId = ref('')
const selectedLeylineId = ref('')

const positions = ref(3)

const positionNames = computed(() => {
  const base = ['主力位', '辅助位', '支援位']
  if (positions.value === 4) {
    return [base[0], base[1], '辅助位', base[2]]
  } else if (positions.value === 5) {
    return [base[0], base[1], '辅助位', '辅助位', base[2]]
  } else if (positions.value === 6) {
    return [base[0], base[1], '辅助位', '辅助位', '辅助位', base[2]]
  }
  return base.slice(0, positions.value)
})

const stats = ['等级', '筋力', '耐力', '敏捷', '魔力', '幸运', '宝具']

const redTeam = ref(Array(6).fill(''))
const blueTeam = ref(Array(6).fill(''))

const fetchCampaigns = async () => {
  try {
    const response = await fetch('/api/campaigns')
    if (response.ok) {
      campaigns.value = await response.json()
    }
  } catch (error) {
    console.error('获取战役列表失败:', error)
  }
}

const fetchLeylines = async (campaignId) => {
  try {
    const response = await fetch(`/api/leylines?campaignId=${campaignId}`)
    if (response.ok) {
      leylines.value = await response.json()
    }
  } catch (error) {
    console.error('获取灵脉列表失败:', error)
  }
}

const fetchCharacters = async (campaignId) => {
  try {
    const response = await fetch(`/api/character-cards?campaignId=${campaignId}`)
    if (response.ok) {
      const data = await response.json()
      characters.value = data.content || data
    }
  } catch (error) {
    console.error('获取角色列表失败:', error)
  }
}

const onCampaignChange = async () => {
  selectedLeylineId.value = ''
  leylines.value = []
  characters.value = []
  redTeam.value = Array(6).fill('')
  blueTeam.value = Array(6).fill('')
  if (selectedCampaignId.value) {
    await fetchLeylines(selectedCampaignId.value)
    await fetchCharacters(selectedCampaignId.value)
  }
}

const onLeylineChange = () => {
  if (!selectedLeylineId.value) {
    selectedLeyline.value = null
    return
  }
  selectedLeyline.value = leylines.value.find(l => l.id === parseInt(selectedLeylineId.value))
}

const selectedLeyline = ref(null)

const addPosition = () => {
  if (positions.value < 6) {
    positions.value++
  }
}

const removePosition = () => {
  if (positions.value > 3) {
    positions.value--
  }
}

const onCharacterSelect = (event, team, index) => {
  const selectedValue = event.target.value
  if (team === 'red') {
    redTeam.value[index] = selectedValue
  } else {
    blueTeam.value[index] = selectedValue
  }
}

const getCharacterStat = (charId, statName) => {
  const char = characters.value.find(c => c.id === parseInt(charId))
  if (!char) return ''
  
  const statMap = {
    '等级': 'level',
    '筋力': 'strength',
    '耐力': 'endurance',
    '敏捷': 'agility',
    '魔力': 'mana',
    '幸运': 'luck',
    '宝具': 'noblePhantasm'
  }
  
  const statKey = statMap[statName]
  if (statKey && char.totalStats && char.totalStats[statKey] !== undefined) {
    return char.totalStats[statKey]
  }
  return ''
}

const calculateTotal = (team, statName) => {
  const teamData = team === 'red' ? redTeam.value : blueTeam.value
  const statMap = {
    '等级': 'level',
    '筋力': 'strength',
    '耐力': 'endurance',
    '敏捷': 'agility',
    '魔力': 'mana',
    '幸运': 'luck',
    '宝具': 'noblePhantasm'
  }
  
  const statKey = statMap[statName]
  let total = 0
  
  teamData.forEach((charId, index) => {
    if (charId) {
      const positionName = positionNames.value[index]
      const char = characters.value.find(c => c.id === parseInt(charId))
      if (char && char.totalStats && char.totalStats[statKey] !== undefined) {
        const value = char.totalStats[statKey]
        if (positionName === '主力位') {
          total += value
        } else if (positionName === '辅助位') {
          total += Math.floor(value / 2)
        }
      }
    }
  })
  
  return total
}

onMounted(() => {
  fetchCampaigns()
})
</script>

<style scoped>
.battle-sheet {
  padding: 1rem;
}
.battle-selector {
  margin-bottom: 1rem;
}
.battle-selector > div {
  display: inline-block;
  margin-right: 1rem;
}
.battle-selector label {
  margin-right: 0.5rem;
}
.battle-selector select {
  padding: 0.5rem;
  font-size: 1rem;
}
.leyline-info {
  margin-bottom: 1rem;
  padding: 1rem;
  background-color: #f0f8ff;
  border: 1px solid #d0e1f5;
  border-radius: 4px;
}
.leyline-info h2 {
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 1.2rem;
}
.info-item {
  margin-bottom: 0.5rem;
}
.info-item .label {
  font-weight: bold;
  margin-right: 0.5rem;
}
.info-item .value {
  color: #333;
}
.battle-table-controls {
  margin-bottom: 1rem;
}
.battle-table-controls button {
  margin-right: 0.5rem;
  padding: 0.5rem 1rem;
  font-size: 1rem;
}
.battle-table-controls button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.battle-sheet h1 {
  margin-bottom: 1rem;
}
.battle-table {
  width: 100%;
  border-collapse: collapse;
}
.battle-table th,
.battle-table td {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: center;
}
.battle-table th {
  background-color: #f5f5f5;
}
.battle-table .red-team {
  background-color: #ffebee;
}
.battle-table .blue-team {
  background-color: #e3f2fd;
}
.battle-table .row-label {
  background-color: #e0e0e0;
  font-weight: bold;
  text-align: left;
}
.battle-table select {
  width: 100%;
  padding: 4px;
  font-size: 0.9rem;
}
</style>
