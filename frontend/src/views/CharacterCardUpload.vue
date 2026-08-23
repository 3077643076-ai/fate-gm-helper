<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useCharacterCardParser } from '../composables/useCharacterCardParser'
import { useExcelParser } from '../composables/useExcelParser'
import { useRPChecker } from '../composables/useRPChecker'
import { createCharacterCard, listCharacterCards, getCharacterCard, deleteCharacterCard } from '../services/characterCard'
import { retireCharacterCard, unretireCharacterCard } from '../services/characterCard'
import { listCampaigns, getSelectedCampaign } from '../services/campaign'

const route = useRoute()
const { calculateRP } = useRPChecker()

const inputText = ref('')
const parsed = ref(null)
const message = ref('')
const submitting = ref(false)
const codeInput = ref('')
const cardType = ref('SERVANT') // SERVANT 或 MASTER
const campaignId = ref(null) // null表示通用角色卡
const isUniversal = ref(false) // 是否为通用角色卡

const searchQuery = ref('')
const searchLoading = ref(false)
const searchResults = ref([])
const selectedCard = ref(null)
const campaigns = ref([])
const selectedCampaignId = ref(null) // 搜索时选择的战役/类别
let searchTimeout = null

// 御主卡：所属从者阶职
const masterServantClass = ref('')

const { parse } = useCharacterCardParser()
const { parseExcelFile } = useExcelParser()

// ---- Excel 上传相关状态 ----
const fileInputRef = ref(null)
const excelParsed = ref(null) // Excel 解析出的卡对象
const excelFileName = ref('') // 当前选择的文件名
const excelError = ref('') // Excel 解析错误信息

const sampleServant = `.st 职介 Rider 合计等级 70 合计筋力 55 合计耐久 55 合计敏捷 75 合计魔力 95 合计幸运 115 合计宝具 65 基础等级 70 基础筋力 50 基础耐久 50 基础敏捷 70 基础魔力 90 基础幸运 110 基础宝具 0 补正等级 0 补正筋力 5 补正耐久 5 补正敏捷 5 补正魔力 5 补正幸运 5 补正宝具 5 职介技能1 对魔力B(本职) 职介技能2 骑乘A(本职) 职介技能3 神性B 保有技能1 领袖气质A 保有技能2 皇帝特权A 保有技能3 太阳神的加护A 宝具1 光辉复合大神殿EX 宝具2 暗夜太阳船A+ 宝具3 热砂狮身兽A`

const sampleMaster = `.st 等级40合计筋力5合计耐久5合计敏捷5合计魔力45合计幸运20合计回路60工坊1资源基盘工坊2强能法阵工坊3集束光标保有技能1超越回路B保有技能2增殖的源B保有技能3对胜利的确信A礼装1宝石吊坠礼装2礼装3`

const sample = computed(() => cardType.value === 'MASTER' ? sampleMaster : sampleServant)

// 保存一张已解析好的卡对象（文本解析和 Excel 解析共用此逻辑）
async function saveCard(data) {
  data.code = codeInput.value.trim()
  data.cardType = cardType.value
  // 御主卡时，将职介设置为所选从者阶职，方便在战役视图中按阶职归类
  if (cardType.value === 'MASTER' && masterServantClass.value) {
    data.className = masterServantClass.value
  }
  data.campaignId = isUniversal.value ? null : campaignId.value
  parsed.value = data
  submitting.value = true
  const res = await createCharacterCard(data)
  message.value = `保存成功，ID：${res.id}`
  // 保存成功后刷新搜索结果
  await performSearch()
}

async function handleParseAndSave() {
  message.value = ''
  selectedCard.value = null
  try {
    if (!codeInput.value.trim()) {
      throw new Error('请先输入代号')
    }
    let data
    if (excelParsed.value) {
      // 有 Excel 解析结果时优先保存它
      data = excelParsed.value
    } else {
      data = parse(inputText.value, cardType.value)
    }
    await saveCard(data)
    // 保存成功后清除待保存的 Excel 解析结果，避免重复保存
    excelParsed.value = null
  } catch (err) {
    message.value = err.message || '解析/保存失败'
  } finally {
    submitting.value = false
  }
}

// ---- Excel 文件处理 ----
function onDragOver(e) {
  e.preventDefault()
}

function onDrop(e) {
  const file = e.dataTransfer.files && e.dataTransfer.files[0]
  if (file) handleFile(file)
}

async function onFileSelect(e) {
  const file = e.target.files && e.target.files[0]
  if (file) await handleFile(file)
  // 清空 input 的值，允许下次选择同一个文件
  e.target.value = ''
}

async function handleFile(file) {
  excelError.value = ''
  try {
    const data = await parseExcelFile(file)
    excelParsed.value = data
    excelFileName.value = file.name
    // 自动识别卡类型（从者/御主）
    cardType.value = data.cardType
    // 代号未填时，用文件名当默认代号（可在输入框中修改）
    if (!codeInput.value.trim()) {
      codeInput.value = file.name.replace(/\.(xlsx|xls)$/i, '')
    }
    // 立即在下方预览解析结果
    parsed.value = data
    selectedCard.value = null
    message.value = 'Excel 解析成功，请确认代号后点击"解析并保存"'
  } catch (err) {
    excelError.value = err.message || 'Excel 解析失败'
    excelParsed.value = null
  }
}

async function loadCampaigns() {
  try {
    campaigns.value = await listCampaigns()
    // 优先使用路由参数中的战役ID
    const routeCampaignId = route.params.campaignId
    if (routeCampaignId) {
      campaignId.value = Number(routeCampaignId)
      isUniversal.value = false
    } else {
      // 否则加载当前选择的战役
      const selected = await getSelectedCampaign()
      if (selected.id) {
        campaignId.value = selected.id
      }
    }
  } catch (err) {
    console.error('加载战役列表失败:', err)
  }
}

async function performSearch() {
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }
  
  searchTimeout = setTimeout(async () => {
    searchLoading.value = true
    try {
      const keyword = searchQuery.value.trim()
      // 统一拉取（包含所有战役 + 通用），再在前端按类别过滤
      const res = await listCharacterCards(0, 200, keyword || null, null)
      let list = res.content || []
      if (selectedCampaignId.value === 'UNIVERSAL') {
        list = list.filter(item => !item.campaignId)
      } else if (selectedCampaignId.value != null) {
        list = list.filter(item => item.campaignId === selectedCampaignId.value)
      }
      searchResults.value = list
    } catch (err) {
      message.value = err.message || '搜索失败'
      searchResults.value = []
    } finally {
      searchLoading.value = false
    }
  }, 300) // 防抖：300ms
}

// 监听搜索输入变化
watch([searchQuery, selectedCampaignId], () => {
  performSearch()
})

watch(isUniversal, (val) => {
  if (val) {
    campaignId.value = null
  }
})

// 用户开始编辑 .st 文本时，放弃待保存的 Excel 解析结果（避免保存错对象）
watch(inputText, () => {
  excelParsed.value = null
})

onMounted(() => {
  loadCampaigns()
  performSearch()
})

async function handleSelect(id) {
  message.value = ''
  try {
    selectedCard.value = await getCharacterCard(id)
    parsed.value = null
    inputText.value = ''
  } catch (err) {
    message.value = err.message || '获取详情失败'
  }
}

async function handleDelete(id) {
  if (!window.confirm('确定要删除这张人物卡吗？此操作不可撤销。')) return
  try {
    await deleteCharacterCard(id)
    // 删除成功后直接刷新页面，确保列表与预览与后端状态完全一致
    window.location.reload()
  } catch (err) {
    message.value = err.message || '删除失败'
  }
}

async function retire(id) {
  if (!window.confirm('确定要让该角色退场？')) return
  try {
    await retireCharacterCard(id)
    window.location.reload()
  } catch (err) {
    message.value = err.message || '退场失败'
  }
}

async function unretire(id) {
  try {
    await unretireCharacterCard(id)
    window.location.reload()
  } catch (err) {
    message.value = err.message || '重新登场失败'
  }
}

const showingCard = computed(() => selectedCard.value || parsed.value)

// RP 统计（仅从者卡）
const rpResult = computed(() => {
  const card = showingCard.value
  if (!card || card.cardType !== 'SERVANT') return null
  return calculateRP(card)
})
</script>

<template>
  <section class="page-card upload-page">
    <div class="page-head">
      <div>
        <h1 class="page-title">角色卡上传 / 检索</h1>
        <p class="page-subtitle">粘贴 .st 文本解析并保存，或检索已存人物卡并展示</p>
      </div>
      <div class="head-actions">
        <select v-model="cardType" class="type-select">
          <option value="SERVANT">从者人物卡</option>
          <option value="MASTER">御主角色卡</option>
        </select>
        <input
          v-model="codeInput"
          class="code-input"
          type="text"
          placeholder="请输入代号后再保存"
        />
        <select
          v-if="cardType === 'MASTER'"
          v-model="masterServantClass"
          class="type-select"
        >
          <option value="">选择所属从者阶职</option>
          <option value="弓">弓</option>
          <option value="杀">杀</option>
          <option value="骑">骑</option>
          <option value="剑">剑</option>
            <option value="枪">枪</option>
          <option value="术">术</option>
          <option value="狂">狂</option>
        </select>
        <label class="checkbox-label">
          <input type="checkbox" v-model="isUniversal" />
          通用角色卡
        </label>
        <select v-if="!isUniversal" v-model="campaignId" class="campaign-select">
          <option :value="null">选择战役</option>
          <option v-for="campaign in campaigns" :key="campaign.id" :value="campaign.id">
            {{ campaign.name }}
          </option>
        </select>
        <button class="btn btn-primary" :disabled="submitting" @click="handleParseAndSave">
          {{ submitting ? '保存中...' : '解析并保存' }}
        </button>
      </div>
    </div>

    <div class="two-column">
      <div class="input-block">
        <label class="block-label">角色卡文本</label>
        <textarea
          v-model="inputText"
          rows="8"
          placeholder="在此粘贴角色卡文本，需以 .st 开头"
        ></textarea>
        <div class="sample">
          <strong>示例：</strong>
          <span>{{ sample }}</span>
        </div>

        <div class="excel-upload">
          <label class="block-label">或直接上传 Excel 角色卡（RC1.15 模板）</label>
          <div
            class="file-drop-zone"
            @click="fileInputRef && fileInputRef.click()"
            @dragover.prevent="onDragOver"
            @drop.prevent="onDrop"
          >
            <input
              ref="fileInputRef"
              type="file"
              accept=".xlsx,.xls"
              class="file-input-hidden"
              @change="onFileSelect"
            />
            <span>点击选择或拖拽 .xlsx / .xls 文件</span>
            <span v-if="excelFileName" class="excel-file-name">{{ excelFileName }}</span>
          </div>
          <p v-if="excelParsed" class="excel-ok">
            已解析：{{ excelParsed.cardType === 'SERVANT' ? '从者卡' : '御主卡' }}（职介：{{ excelParsed.className }}），确认上方代号后点"解析并保存"
          </p>
          <p v-if="excelError" class="excel-error">{{ excelError }}</p>
        </div>

        <div class="excel-help">
          <h3>Excel 备用方案（直接上传不成功时用）</h3>
          <p>如果上方直接上传不成功，可以在人物卡文件中添加以下公式，将整张卡导出为一行 .st 文本，然后复制到上面的输入框中。</p>
          <ul>
            <li>
              <strong>从者人物卡公式（填在任意空单元格中）：</strong>
              <pre v-pre>
".st 职介 "&amp;N3&amp;
" 合计等级 "&amp;C15&amp;
" 合计筋力 "&amp;D15&amp;
" 合计耐久 "&amp;E15&amp;
" 合计敏捷 "&amp;F15&amp;
" 合计魔力 "&amp;G15&amp;
" 合计幸运 "&amp;H15&amp;
" 合计宝具 "&amp;I15&amp;
" 基础等级 "&amp;C17+C16&amp;
" 基础筋力 "&amp;D17+D16&amp;
" 基础耐久 "&amp;E17+E16&amp;
" 基础敏捷 "&amp;F17+F16&amp;
" 基础魔力 "&amp;G17+G16&amp;
" 基础幸运 "&amp;H17+H16&amp;
" 基础宝具 "&amp;I16+V72&amp;
" 补正等级 "&amp;C18&amp;
" 补正筋力 "&amp;D18&amp;
" 补正耐久 "&amp;E18&amp;
" 补正敏捷 "&amp;F18&amp;
" 补正魔力 "&amp;G18&amp;
" 补正幸运 "&amp;H18&amp;
" 补正宝具 "&amp;I18&amp;
" 职介技能1 "&amp;C20&amp;" "&amp;F20&amp;
" 职介技能2 "&amp;C29&amp;" "&amp;F29&amp;
" 职介技能3 "&amp;C38&amp;" "&amp;F38&amp;
" 保有技能1 "&amp;C48&amp;" "&amp;F48&amp;
" 保有技能2 "&amp;C57&amp;" "&amp;F57&amp;
" 保有技能3 "&amp;C66&amp;" "&amp;F66&amp;
" 宝具1 "&amp;M20&amp;" "&amp;P20&amp;
" 宝具2 "&amp;M29&amp;" "&amp;P29&amp;
" 宝具3 "&amp;M38&amp;" "&amp;P38
              </pre>
            </li>
            <li>
              <strong>御主人物卡公式（填在任意空单元格中）：</strong>
              <pre v-pre>
".st 等级 "&amp;C16&amp;
" 合计筋力 "&amp;D16&amp;
" 合计耐久 "&amp;E16&amp;
" 合计敏捷 "&amp;F16&amp;
" 合计魔力 "&amp;G16&amp;
" 合计幸运 "&amp;H16&amp;
" 合计回路 "&amp;I16&amp;
" 工坊1 "&amp;C26&amp;
" 工坊2 "&amp;C33&amp;
" 工坊3 "&amp;C40&amp;
" 保有技能1 "&amp;C48&amp;" "&amp;F48&amp;
" 保有技能2 "&amp;C57&amp;" "&amp;F57&amp;
" 保有技能3 "&amp;C66&amp;" "&amp;F66&amp;
" 礼装1 "&amp;M48&amp;
" 礼装2 "&amp;M57&amp;
" 礼装3 "&amp;M66
              </pre>
            </li>
          </ul>
          <p class="excel-steps">
            使用方法：在 Excel 中将以上公式粘贴到人物卡工作表的某个空单元格，按回车生成整行 .st 文本，然后复制该单元格的内容，粘贴到上方“角色卡文本”输入框中，再填写代号和战役后点击“解析并保存”。
          </p>
        </div>
      </div>

      <div class="search-block">
        <div class="search-head">
          <label class="block-label">搜索已存人物卡（仅显示当前选中战役或通用角色卡）</label>
          <select v-model="selectedCampaignId" class="campaign-filter">
            <option :value="null">全部战役 + 通用</option>
            <option value="UNIVERSAL">通用角色卡</option>
            <option v-for="campaign in campaigns" :key="campaign.id" :value="campaign.id">
              {{ campaign.name }}
            </option>
          </select>
          <input
            v-model="searchQuery"
            class="search-input"
            type="text"
            placeholder="按代号/职介关键词过滤"
          />
        </div>
        <div class="search-list" v-if="!searchLoading">
          <div
            v-for="item in searchResults"
            :key="item.id"
            class="search-item"
          >
            <div class="search-item-main" @click="handleSelect(item.id)">
              <div class="search-item-title">{{ item.code || '未知代号' }}</div>
              <div class="search-item-sub">
                类型：{{ item.cardType === 'SERVANT' ? '从者' : '御主' }} ｜ 
                职介：{{ item.className }} ｜ 
                {{ item.campaignName ? `战役：${item.campaignName}` : '通用角色卡' }} ｜ 
                ID：{{ item.id }}
              </div>
            </div>
            <button v-if="!item.retired" class="btn btn-danger btn-sm" @click.stop="handleDelete(item.id)">删除</button>
            <button v-if="!item.retired" class="btn btn-warning btn-sm" @click.stop="async () => { await retire(item.id); }">退场</button>
            <button v-else class="btn btn-primary btn-sm" @click.stop="async () => { await unretire(item.id); }">重新登场</button>
          </div>
          <div v-if="!searchResults.length" class="empty-tip">
            {{ searchQuery.trim() ? '无匹配人物卡' : '暂无人物卡，请先上传' }}
          </div>
        </div>
        <div class="search-loading" v-else>加载中...</div>
      </div>
    </div>

    <p v-if="message" class="message">{{ message }}</p>

    <!-- RP 资源点统计面板 -->
    <div v-if="rpResult" class="rp-panel">
      <div class="rp-header">
        <h2>资源点（RP）统计</h2>
        <div class="rp-total" :class="{ 'rp-over': rpResult.isOver }">
          <span class="rp-number">{{ rpResult.totalRP }}</span>
          <span class="rp-divider">/</span>
          <span class="rp-baseline">{{ rpResult.baseline }}</span>
          <span v-if="rpResult.isOver" class="rp-over-badge">超出 {{ rpResult.over }} RP</span>
          <span v-else class="rp-ok-badge">剩余 {{ Math.abs(rpResult.over) }} RP</span>
        </div>
      </div>

      <div class="rp-note" v-if="rpResult.isOver">
        此角色卡超出标准24RP。部分杯战允许超出，请GM根据剧本设定判断是否接受。
      </div>

      <table class="rp-table">
        <thead>
          <tr>
            <th>类别</th>
            <th>详情</th>
            <th class="rp-col">RP</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, idx) in rpResult.breakdown" :key="idx">
            <td class="rp-cat">{{ item.category }}</td>
            <td class="rp-detail">
              <!-- 属性行 -->
              <template v-if="item.category === '属性分配'">
                <div class="rp-attr-grid">
                  <span v-for="d in item.detail" :key="d.label"
                    :class="{ 'rp-attr-over': d.overLimit }"
                    :title="d.overLimit ? `${d.label}超出分配上限${d.maxAlloc}` : ''">
                    {{ d.label }}{{ d.base }}<span class="rp-attr-alloc">(职介{{ d.classBase }}+分配{{ d.allocated }})</span>
                  </span>
                </div>
                <div class="rp-item-note">{{ item.note }}</div>
              </template>
              <!-- 技能/宝具行 -->
              <template v-else>
                <div v-for="d in item.detail" :key="d.name" class="rp-skill-line">
                  <span :class="{ 'rp-class-skill': d.isClass }">{{ d.name }}</span>
                  <span class="rp-rank">[{{ d.rank }}]</span>
                  <span v-if="d.plusCost" class="rp-plus">+加符</span>
                  <span class="rp-cost">{{ d.cost }}RP</span>
                </div>
                <div v-if="item.category === '额外宝具栏'" class="rp-item-note">{{ item.detail }}</div>
              </template>
            </td>
            <td class="rp-col rp-val">{{ item.rp }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2" class="rp-total-label">合计</td>
            <td class="rp-col rp-total-val" :class="{ 'rp-over': rpResult.isOver }">{{ rpResult.totalRP }} RP</td>
          </tr>
        </tfoot>
      </table>

      <!-- 宝具属性校验 -->
      <div v-if="!rpResult.npMatchExpected" class="rp-warning">
        宝具属性({{ rpResult.npBase }})与最高宝具等级{{ rpResult.highestNpRank }}应有值({{ rpResult.expectedNpStat }})不匹配，请检查。
      </div>
    </div>

    <div v-if="showingCard" class="preview-grid">
      <div class="card-section">
        <h3>基础信息</h3>
        <p>代号：{{ showingCard.code }}</p>
        <p>职介：{{ showingCard.className }}</p>
      </div>

      <div class="card-section">
        <h3>合计属性</h3>
        <ul>
          <li>等级：{{ showingCard.totalStats.level }}</li>
          <li>筋力：{{ showingCard.totalStats.strength }}</li>
          <li>耐久：{{ showingCard.totalStats.endurance }}</li>
          <li>敏捷：{{ showingCard.totalStats.agility }}</li>
          <li>魔力：{{ showingCard.totalStats.mana }}</li>
          <li>幸运：{{ showingCard.totalStats.luck }}</li>
          <li>宝具：{{ showingCard.totalStats.noblePhantasm }}</li>
        </ul>
      </div>

      <div class="card-section">
        <h3>基础属性</h3>
        <ul>
          <li>等级：{{ showingCard.baseStats.level }}</li>
          <li>筋力：{{ showingCard.baseStats.strength }}</li>
          <li>耐久：{{ showingCard.baseStats.endurance }}</li>
          <li>敏捷：{{ showingCard.baseStats.agility }}</li>
          <li>魔力：{{ showingCard.baseStats.mana }}</li>
          <li>幸运：{{ showingCard.baseStats.luck }}</li>
          <li>宝具：{{ showingCard.baseStats.noblePhantasm }}</li>
        </ul>
      </div>

      <div class="card-section">
        <h3>补正属性</h3>
        <ul>
          <li>等级：{{ showingCard.correctionStats.level }}</li>
          <li>筋力：{{ showingCard.correctionStats.strength }}</li>
          <li>耐久：{{ showingCard.correctionStats.endurance }}</li>
          <li>敏捷：{{ showingCard.correctionStats.agility }}</li>
          <li>魔力：{{ showingCard.correctionStats.mana }}</li>
          <li>幸运：{{ showingCard.correctionStats.luck }}</li>
          <li>宝具：{{ showingCard.correctionStats.noblePhantasm }}</li>
        </ul>
      </div>

      <div class="card-section">
        <h3>职介技能</h3>
        <ul>
          <li v-for="(s, i) in showingCard.classSkills" :key="`c-${i}`">{{ s.name }}</li>
          <li v-if="!showingCard.classSkills?.length">无</li>
        </ul>
      </div>

      <div class="card-section">
        <h3>保有技能</h3>
        <ul>
          <li v-for="(s, i) in showingCard.personalSkills" :key="`p-${i}`">{{ s.name }}</li>
          <li v-if="!showingCard.personalSkills?.length">无</li>
        </ul>
      </div>

      <div class="card-section">
        <h3>宝具</h3>
        <ul>
          <li v-for="(s, i) in showingCard.noblePhantasms" :key="`n-${i}`">{{ s.name }}</li>
          <li v-if="!showingCard.noblePhantasms?.length">无</li>
        </ul>
      </div>

      <div v-if="showingCard.cardType === 'MASTER'" class="card-section">
        <h3>工坊</h3>
        <ul>
          <li v-for="(w, i) in showingCard.workshops" :key="`w-${i}`">{{ w.name }}</li>
          <li v-if="!showingCard.workshops?.length">无</li>
        </ul>
      </div>

      <div v-if="showingCard.cardType === 'MASTER'" class="card-section">
        <h3>礼装</h3>
        <ul>
          <li v-for="(c, i) in showingCard.craftEssences" :key="`c-${i}`">{{ c.name }}</li>
          <li v-if="!showingCard.craftEssences?.length">无</li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.upload-page {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.head-actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
}

.code-input {
  min-width: 200px;
  border: 1px solid var(--color-border);
  border-radius: 0.6rem;
  padding: 0.55rem 0.75rem;
  font-size: 1rem;
}

.type-select,
.campaign-select,
.campaign-filter {
  min-width: 120px;
  border: 1px solid var(--color-border);
  border-radius: 0.6rem;
  padding: 0.55rem 0.75rem;
  font-size: 1rem;
  background: white;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.95rem;
  white-space: nowrap;
}

.btn {
  border: none;
  border-radius: 8px;
  padding: 0.65rem 1.2rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  box-shadow: 0 6px 12px rgba(102, 126, 234, 0.25);
}

.btn[disabled] {
  opacity: 0.6;
  cursor: not-allowed;
}

.two-column {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1rem;
}

.input-block textarea {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 0.6rem;
  padding: 0.9rem;
  font-size: 1rem;
  min-height: 180px;
  resize: vertical;
}

.block-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
}

.sample {
  margin-top: 0.5rem;
  color: var(--color-text-secondary);
  font-size: 0.95rem;
}

.excel-help {
  margin-top: 1rem;
  padding: 0.75rem 0.9rem;
  border-radius: 0.6rem;
  border: 1px dashed var(--color-border);
  background: #fdfdfb;
  font-size: 0.9rem;
}

.excel-help h3 {
  margin: 0 0 0.4rem;
  font-size: 1rem;
}

.excel-help pre {
  background: #1e293b;
  color: #e5e7eb;
  border-radius: 0.5rem;
  padding: 0.6rem 0.75rem;
  font-size: 0.8rem;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.excel-steps {
  margin-top: 0.5rem;
  color: var(--color-text-secondary);
}

.excel-upload {
  margin-top: 1rem;
}

.file-drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 1.25rem 1rem;
  border: 2px dashed var(--color-border);
  border-radius: 0.6rem;
  background: #fafaf8;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.file-drop-zone:hover {
  border-color: #667eea;
  background: #f5f6ff;
  color: #4a5bd9;
}

.file-input-hidden {
  display: none;
}

.excel-file-name {
  font-weight: 600;
  color: #5f3dc4;
  font-size: 0.9rem;
  word-break: break-all;
  text-align: center;
}

.excel-ok {
  margin: 0.5rem 0 0;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  background: #e6f7e6;
  border: 1px solid #b7e3b7;
  color: #2e7d32;
  font-size: 0.9rem;
}

.excel-error {
  margin: 0.5rem 0 0;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  background: #fff0f0;
  border: 1px solid #f0c0c0;
  color: #b71c1c;
  font-size: 0.9rem;
}

.message {
  margin: 0;
  padding: 0.75rem 1rem;
  border-radius: 0.6rem;
  background: #f8f5ff;
  color: #5f3dc4;
  border: 1px solid #e5dbff;
}

.search-block {
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  padding: 1rem;
  background: #fff;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.search-head {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.search-input {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 0.6rem;
  padding: 0.6rem 0.75rem;
  font-size: 1rem;
}

.search-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  max-height: 240px;
  overflow: auto;
}

.search-item {
  border: 1px solid var(--color-border);
  border-radius: 0.6rem;
  padding: 0.6rem 0.75rem;
  background: #f8f9ff;
  cursor: pointer;
  transition: all 0.2s ease;
}

.search-item:hover {
  background: #eef1ff;
  border-color: #d0d7ff;
}

.search-item-title {
  font-weight: 700;
}

.search-item-sub {
  color: var(--color-text-secondary);
  font-size: 0.95rem;
}

.search-loading,
.empty-tip {
  color: var(--color-text-secondary);
  font-size: 0.95rem;
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
}

.card-section {
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  padding: 1rem;
  background: #fff;
}

.card-section h3 {
  margin: 0 0 0.5rem;
}

.card-section ul {
  margin: 0;
  padding-left: 1.1rem;
  color: var(--color-text-secondary);
}

/* ===== RP 面板样式 ===== */
.rp-panel {
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  padding: 1.25rem;
  background: #fefefe;
}

.rp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.rp-header h2 {
  margin: 0;
  font-size: 1.15rem;
}

.rp-total {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
  font-size: 1.1rem;
  padding: 0.3rem 0.8rem;
  border-radius: 0.5rem;
  background: #e6f7e6;
}

.rp-total.rp-over {
  background: #fff0f0;
}

.rp-number {
  font-weight: 800;
  font-size: 1.4rem;
}

.rp-baseline {
  color: #888;
}

.rp-over-badge {
  margin-left: 0.5rem;
  font-size: 0.85rem;
  color: #d32f2f;
  font-weight: 700;
}

.rp-ok-badge {
  margin-left: 0.5rem;
  font-size: 0.85rem;
  color: #2e7d32;
  font-weight: 700;
}

.rp-note {
  margin-bottom: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: #fff8e1;
  border-left: 3px solid #ffc107;
  font-size: 0.9rem;
  color: #795548;
  border-radius: 0.3rem;
}

.rp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.rp-table th {
  text-align: left;
  padding: 0.5rem 0.6rem;
  border-bottom: 2px solid #ddd;
  background: #f5f5f5;
  font-weight: 700;
}

.rp-table td {
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid #eee;
  vertical-align: top;
}

.rp-col {
  text-align: right;
  white-space: nowrap;
  width: 60px;
}

.rp-cat {
  font-weight: 700;
  white-space: nowrap;
  width: 100px;
}

.rp-attr-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 0.8rem;
}

.rp-attr-grid span {
  font-size: 0.88rem;
}

.rp-attr-alloc {
  color: #999;
  font-size: 0.8rem;
}

.rp-attr-over {
  color: #d32f2f;
  font-weight: 700;
  text-decoration: underline wavy #d32f2f;
}

.rp-skill-line {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.15rem 0;
}

.rp-class-skill {
  color: #5f3dc4;
}

.rp-rank {
  color: #888;
  font-size: 0.8rem;
}

.rp-plus {
  color: #e67e22;
  font-size: 0.8rem;
  font-weight: 600;
}

.rp-cost {
  margin-left: auto;
  font-weight: 600;
  color: #555;
}

.rp-item-note {
  margin-top: 0.3rem;
  font-size: 0.82rem;
  color: #aaa;
}

.rp-total-label {
  font-weight: 700;
  text-align: right;
}

.rp-total-val {
  font-weight: 800;
  font-size: 1.1rem;
}

.rp-total-val.rp-over {
  color: #d32f2f;
}

.rp-warning {
  margin-top: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: #fff0f0;
  border-left: 3px solid #d32f2f;
  font-size: 0.9rem;
  color: #b71c1c;
  border-radius: 0.3rem;
}
</style>

