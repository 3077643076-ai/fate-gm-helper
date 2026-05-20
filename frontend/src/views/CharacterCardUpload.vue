<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useCharacterCardParser } from '../composables/useCharacterCardParser'
import { useExcelParser } from '../composables/useExcelParser'
import { createCharacterCard, listCharacterCards, getCharacterCard, deleteCharacterCard } from '../services/characterCard'
import { retireCharacterCard, unretireCharacterCard } from '../services/characterCard'
import { listCampaigns, getSelectedCampaign } from '../services/campaign'

const route = useRoute()

const inputText = ref('')
const parsed = ref(null)
const message = ref('')
const submitting = ref(false)
const codeInput = ref('')
const cardType = ref('SERVANT') // SERVANT 或 MASTER
const campaignId = ref(null) // null表示通用角色卡
const isUniversal = ref(false) // 是否为通用角色卡

// Excel 文件上传相关状态
const uploadMessage = ref('')
const uploadDragover = ref(false)
const parsedExcelData = ref(null) // Excel 解析结果，保存时优先使用
const fileInputRef = ref(null)
const activeTab = ref('upload') // 'upload' | 'paste' — 上传/粘贴切换
const helpExpanded = ref(false) // Excel公式帮助是否展开

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

const sampleServant = `.st 职介 Rider 合计等级 70 合计筋力 55 合计耐久 55 合计敏捷 75 合计魔力 95 合计幸运 115 合计宝具 65 基础等级 70 基础筋力 50 基础耐久 50 基础敏捷 70 基础魔力 90 基础幸运 110 基础宝具 0 补正等级 0 补正筋力 5 补正耐久 5 补正敏捷 5 补正魔力 5 补正幸运 5 补正宝具 5 职介技能1 对魔力B(本职) 职介技能2 骑乘A(本职) 职介技能3 神性B 保有技能1 领袖气质A 保有技能2 皇帝特权A 保有技能3 太阳神的加护A 宝具1 光辉复合大神殿EX 宝具2 暗夜太阳船A+ 宝具3 热砂狮身兽A`

const sampleMaster = `.st 等级40合计筋力5合计耐久5合计敏捷5合计魔力45合计幸运20合计回路60工坊1资源基盘工坊2强能法阵工坊3集束光标保有技能1超越回路B保有技能2增殖的源B保有技能3对胜利的确信A礼装1宝石吊坠礼装2礼装3`

const sample = computed(() => cardType.value === 'MASTER' ? sampleMaster : sampleServant)

// ---- Excel 文件上传 ----

/**
 * 处理用户上传的 Excel 角色卡文件
 * 自动解析单元格数据，检测卡片类型，展示解析预览
 */
async function handleFileUpload(file) {
  uploadMessage.value = ''
  parsedExcelData.value = null
  selectedCard.value = null

  try {
    // 先用 parseExcelFile 获取基础数据
    const data = await parseExcelFile(file)

    // 自动切换卡片类型选择器
    cardType.value = data.cardType

    // 如果从文件名或内容推测代号，自动填入（方便玩家）
    // 从文件名中提取可能的代号（去掉扩展名）
    const fileName = file.name.replace(/\.(xlsx|xls)$/i, '')
    if (fileName && fileName.length > 0 && fileName.length < 30) {
      codeInput.value = fileName
    }

    // 存储解析结果，保存时直接用
    parsedExcelData.value = data
    parsed.value = data

    uploadMessage.value = `已解析「${file.name}」(${data.cardType === 'SERVANT' ? '从者' : '御主'}卡)，请在下方确认预览并填写代号后保存`
  } catch (err) {
    uploadMessage.value = `解析失败：${err.message}`
    parsedExcelData.value = null
  }
}

/** 拖拽文件进入上传区域 */
function onDragOver(e) {
  e.preventDefault()
  uploadDragover.value = true
}
function onDragLeave() {
  uploadDragover.value = false
}
function onDrop(e) {
  e.preventDefault()
  uploadDragover.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) handleFileUpload(file)
}
function onFileSelect(e) {
  const file = e.target?.files?.[0]
  if (file) handleFileUpload(file)
}
/** 清除 Excel 解析结果，回到文本输入模式 */
function clearExcelData() {
  parsedExcelData.value = null
  parsed.value = null
  uploadMessage.value = ''
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}
async function handleParseAndSave() {
  message.value = ''
  selectedCard.value = null
  try {
    if (!codeInput.value.trim()) {
      throw new Error('请先输入代号')
    }

    // 如果有 Excel 解析数据，直接使用；否则从文本框解析
    let data
    if (parsedExcelData.value) {
      data = { ...parsedExcelData.value }
    } else {
      data = parse(inputText.value, cardType.value)
    }

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
    // 清除 Excel 临时数据
    parsedExcelData.value = null
    uploadMessage.value = ''
    // 保存成功后刷新搜索结果
    await performSearch()
  } catch (err) {
    message.value = err.message || '解析/保存失败'
  } finally {
    submitting.value = false
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
</script>

<template>
  <section class="page-card upload-page">
    <!-- ===== 页面头部 ===== -->
    <div class="page-head">
      <div>
        <h1 class="page-title">角色卡上传 / 检索</h1>
        <p class="page-subtitle">上传 RC1.15 Excel 角色卡文件自动解析，或粘贴 .st 文本手动解析</p>
      </div>
    </div>

    <!-- ===== 控制栏 ===== -->
    <div class="control-bar">
      <!-- 卡片类型 -->
      <div class="control-item">
        <label class="control-label">卡片类型</label>
        <select v-model="cardType" class="type-select">
          <option value="SERVANT">从者人物卡</option>
          <option value="MASTER">御主角色卡</option>
        </select>
      </div>
      <!-- 代号 -->
      <div class="control-item control-item-grow">
        <label class="control-label">角色代号</label>
        <input
          v-model="codeInput"
          class="code-input"
          type="text"
          placeholder="输入代号（保存前必填）"
        />
      </div>
      <!-- 御主专属：所属从者阶职 -->
      <div v-if="cardType === 'MASTER'" class="control-item">
        <label class="control-label">所属阶职</label>
        <select v-model="masterServantClass" class="type-select">
          <option value="">（可选）</option>
          <option value="剑">剑</option>
          <option value="弓">弓</option>
          <option value="枪">枪</option>
          <option value="骑">骑</option>
          <option value="术">术</option>
          <option value="杀">杀</option>
          <option value="狂">狂</option>
        </select>
      </div>
      <!-- 战役关联 -->
      <div class="control-item">
        <label class="control-label">关联战役</label>
        <div class="campaign-row">
          <label class="checkbox-label">
            <input type="checkbox" v-model="isUniversal" />
            通用
          </label>
          <select v-if="!isUniversal" v-model="campaignId" class="campaign-select">
            <option :value="null">选择战役</option>
            <option v-for="campaign in campaigns" :key="campaign.id" :value="campaign.id">
              {{ campaign.name }}
            </option>
          </select>
        </div>
      </div>
      <!-- 保存按钮 -->
      <div class="control-item control-item-btn">
        <label class="control-label">&nbsp;</label>
        <button class="btn btn-primary" :disabled="submitting" @click="handleParseAndSave">
          {{ submitting ? '保存中...' : '解析并保存' }}
        </button>
      </div>
    </div>

    <!-- ===== 消息提示 ===== -->
    <p v-if="message" class="message">{{ message }}</p>

    <!-- ===== 两栏布局：左（输入+搜索）/ 右（预览） ===== -->
    <div class="two-column">
      <!-- 左栏：输入区 + 搜索列表 -->
      <div class="left-column">
        <!-- 输入区（Tab 切换） -->
        <div class="input-block">
          <div class="tab-bar">
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'upload' }"
              @click="activeTab = 'upload'"
            >
              📁 上传 Excel 文件
            </button>
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'paste' }"
              @click="activeTab = 'paste'"
            >
              📝 粘贴 .st 文本
            </button>
          </div>

          <!-- Tab 内容：上传 Excel -->
          <div v-show="activeTab === 'upload'" class="tab-content">
            <div
              class="file-drop-zone"
              :class="{ dragover: uploadDragover }"
              @dragover="onDragOver"
              @dragleave="onDragLeave"
              @drop="onDrop"
              @click="() => fileInputRef && fileInputRef.click()"
            >
              <div class="file-drop-icon">📂</div>
              <div class="file-drop-text">拖拽 .xlsx 角色卡文件到此处，或点击选择文件</div>
              <div class="file-drop-hint">支持 RC1.15 从者/御主角色卡模板，自动识别卡片类型</div>
              <input
                ref="fileInputRef"
                type="file"
                accept=".xlsx,.xls"
                class="file-input-hidden"
                @change="onFileSelect"
              />
            </div>
            <div
              v-if="uploadMessage"
              class="upload-msg"
              :class="{ 'upload-err': uploadMessage.startsWith('解析失败') }"
            >
              {{ uploadMessage }}
              <button v-if="parsedExcelData" class="btn-clear-upload" @click="clearExcelData">✕ 清除</button>
            </div>
          </div>

          <!-- Tab 内容：粘贴文本 -->
          <div v-show="activeTab === 'paste'" class="tab-content">
            <textarea
              v-model="inputText"
              rows="6"
              placeholder="在此粘贴角色卡文本，需以 .st 开头"
            ></textarea>
            <div class="sample">
              <strong>示例（{{ cardType === 'MASTER' ? '御主' : '从者' }}）：</strong>
              <code>{{ sample }}</code>
            </div>

            <!-- 可折叠的 Excel 公式帮助 -->
            <div class="excel-help-toggle" @click="helpExpanded = !helpExpanded">
              <span>📋 Excel 导出公式（旧版人物卡用）</span>
              <span class="help-arrow">{{ helpExpanded ? '▲' : '▼' }}</span>
            </div>
            <div v-if="helpExpanded" class="excel-help">
              <p>如果你使用旧版人物卡 Excel，可以在人物卡文件中添加以下公式，将整张卡导出为一行 .st 文本，然后复制到上面的输入框中。</p>
              <h4>从者人物卡公式（填在任意空单元格中）：</h4>
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
              <h4>御主人物卡公式（填在任意空单元格中）：</h4>
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
              <p class="excel-steps">
                使用方法：在 Excel 中将以上公式粘贴到人物卡工作表的某个空单元格，按回车生成整行 .st 文本，然后复制该单元格的内容，粘贴到上方文本框中，再填写代号和战役后点击"解析并保存"。
              </p>
            </div>
          </div>
        </div>

        <!-- 搜索已存角色卡 -->
        <div class="search-block">
          <div class="search-head">
            <label class="block-label">已存角色卡</label>
            <div class="search-controls">
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
          </div>
          <div class="search-list" v-if="!searchLoading">
            <div
              v-for="item in searchResults"
              :key="item.id"
              class="search-item"
            >
              <div class="search-item-main" @click="handleSelect(item.id)">
                <div class="search-item-title">
                  {{ item.code || '未知代号' }}
                  <span class="search-item-badge" :class="item.cardType === 'SERVANT' ? 'badge-servant' : 'badge-master'">
                    {{ item.cardType === 'SERVANT' ? '从者' : '御主' }}
                  </span>
                </div>
                <div class="search-item-sub">
                  职介：{{ item.className || '无' }} ｜
                  {{ item.campaignName ? `战役：${item.campaignName}` : '通用角色卡' }} ｜
                  ID：{{ item.id }}
                </div>
              </div>
              <div class="search-item-actions">
                <button
                  v-if="!item.retired"
                  class="btn btn-danger btn-sm"
                  @click.stop="handleDelete(item.id)"
                >删除</button>
                <button
                  v-if="!item.retired"
                  class="btn btn-warning btn-sm"
                  @click.stop="async () => { await retire(item.id); }"
                >退场</button>
                <button
                  v-else
                  class="btn btn-primary btn-sm"
                  @click.stop="async () => { await unretire(item.id); }"
                >重新登场</button>
              </div>
            </div>
            <div v-if="!searchResults.length" class="empty-tip">
              {{ searchQuery.trim() ? '无匹配人物卡' : '暂无人物卡，请先上传' }}
            </div>
          </div>
          <div class="search-loading" v-else>加载中...</div>
        </div>
      </div>

      <!-- 右栏：角色卡预览 -->
      <div class="right-column">
        <div v-if="showingCard" class="preview-panel">
          <div class="card-section">
            <h3>基础信息</h3>
            <p>代号：{{ showingCard.code }}</p>
            <p>职介：{{ showingCard.className }}</p>
            <p>类型：{{ showingCard.cardType === 'SERVANT' ? '从者人物卡' : '御主角色卡' }}</p>
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

        <!-- 未选择角色卡时的占位提示 -->
        <div v-else class="preview-empty">
          <div class="preview-empty-icon">📋</div>
          <div class="preview-empty-text">选择或上传角色卡后，<br/>详细信息会显示在这里</div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.upload-page {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* ===== 页面头部 ===== */
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

/* ===== 控制栏（卡片类型/代号/战役/保存按钮） ===== */
.control-bar {
  display: flex;
  gap: 0.6rem;
  align-items: flex-end;
  flex-wrap: wrap;
  padding: 0.75rem;
  background: #f8f9ff;
  border: 1px solid #e8ecf8;
  border-radius: 0.75rem;
}
.control-item {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.control-item-grow {
  flex: 1;
  min-width: 160px;
}
.control-item-btn {
  align-self: flex-end;
}
.control-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.code-input {
  width: 100%;
  min-width: 180px;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.55rem 0.75rem;
  font-size: 1rem;
}

.type-select,
.campaign-select,
.campaign-filter {
  min-width: 120px;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.55rem 0.75rem;
  font-size: 1rem;
  background: white;
}
.campaign-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.9rem;
  white-space: nowrap;
  cursor: pointer;
}

/* ===== 按钮 ===== */
.btn {
  border: none;
  border-radius: 8px;
  padding: 0.65rem 1.2rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  box-shadow: 0 6px 12px rgba(102, 126, 234, 0.25);
}
.btn-primary:hover {
  box-shadow: 0 8px 16px rgba(102, 126, 234, 0.35);
  transform: translateY(-1px);
}
.btn[disabled] {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}
.btn-sm {
  padding: 0.3rem 0.6rem;
  font-size: 0.8rem;
  border-radius: 6px;
}
.btn-danger {
  background: #fff;
  color: #e53e3e;
  border: 1px solid #e53e3e;
}
.btn-danger:hover {
  background: #e53e3e;
  color: #fff;
}
.btn-warning {
  background: #fff;
  color: #d69e2e;
  border: 1px solid #d69e2e;
}
.btn-warning:hover {
  background: #d69e2e;
  color: #fff;
}

/* ===== 两栏布局：左（输入+搜索） / 右（预览） ===== */
.two-column {
  display: grid;
  grid-template-columns: 440px 1fr;
  gap: 1rem;
  align-items: start;
}
@media (max-width: 1024px) {
  .two-column {
    grid-template-columns: 1fr;
  }
}
.left-column {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.right-column {
  position: sticky;
  top: 1rem;
}
.input-block {
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  overflow: hidden;
  background: #fff;
}

/* ===== Tab 切换 ===== */
.tab-bar {
  display: flex;
  border-bottom: 2px solid #e8ecf8;
}
.tab-btn {
  flex: 1;
  border: none;
  background: #f8f9ff;
  padding: 0.55rem 0.75rem;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  color: #888;
  transition: all 0.2s ease;
}
.tab-btn:hover {
  color: #555;
  background: #f0f2ff;
}
.tab-btn.active {
  color: #667eea;
  background: #fff;
  border-bottom: 2px solid #667eea;
  margin-bottom: -2px;
}
.tab-content {
  padding: 0.75rem;
}

.input-block textarea {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 0.6rem;
  padding: 0.6rem 0.75rem;
  font-size: 0.95rem;
  min-height: 120px;
  resize: vertical;
}

.block-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
}

.sample {
  margin-top: 0.6rem;
  color: var(--color-text-secondary);
  font-size: 0.85rem;
  word-break: break-all;
}
.sample code {
  font-size: 0.78rem;
}

/* ===== Excel 公式帮助折叠面板 ===== */
.excel-help-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.75rem;
  padding: 0.6rem 0.75rem;
  border: 1px dashed var(--color-border);
  border-radius: 0.5rem;
  cursor: pointer;
  font-size: 0.85rem;
  color: #888;
  background: #fdfdfb;
  transition: all 0.15s ease;
}
.excel-help-toggle:hover {
  border-color: #667eea;
  color: #555;
}
.help-arrow {
  font-size: 0.7rem;
}
.excel-help {
  margin-top: 0.5rem;
  padding: 0.75rem 0.9rem;
  border-radius: 0.6rem;
  border: 1px solid #e8ecf8;
  background: #fdfdfb;
  font-size: 0.85rem;
}
.excel-help h4 {
  margin: 0.6rem 0 0.3rem;
  font-size: 0.9rem;
}
.excel-help pre {
  background: #1e293b;
  color: #e5e7eb;
  border-radius: 0.5rem;
  padding: 0.6rem 0.75rem;
  font-size: 0.75rem;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
.excel-steps {
  margin-top: 0.5rem;
  color: var(--color-text-secondary);
}

/* ===== 消息提示 ===== */
.message {
  margin: 0;
  padding: 0.75rem 1rem;
  border-radius: 0.6rem;
  background: #f8f5ff;
  color: #5f3dc4;
  border: 1px solid #e5dbff;
}

/* ===== 文件上传区域 ===== */
.file-drop-zone {
  border: 2px dashed #c4c4e0;
  border-radius: 0.75rem;
  padding: 1.25rem 1rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  background: #fafaff;
}
.file-drop-zone:hover,
.file-drop-zone.dragover {
  border-color: #667eea;
  background: #f0f0ff;
  box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
}
.file-drop-icon {
  font-size: 1.5rem;
  margin-bottom: 0.35rem;
}
.file-drop-text {
  font-size: 0.95rem;
  font-weight: 600;
  color: #333;
}
.file-drop-hint {
  font-size: 0.8rem;
  color: #888;
  margin-top: 0.3rem;
}
.file-input-hidden {
  display: none;
}
.upload-msg {
  margin-top: 0.6rem;
  padding: 0.6rem 0.9rem;
  border-radius: 0.6rem;
  background: #e8f5e9;
  color: #2e7d32;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.upload-msg.upload-err {
  background: #ffebee;
  color: #c62828;
}
.btn-clear-upload {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 0.85rem;
  text-decoration: underline;
  margin-left: auto;
}

/* ===== 搜索区块 ===== */
.search-block {
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  padding: 0.75rem;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  max-height: 280px;
  overflow: hidden;
}
.search-head {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.search-controls {
  display: flex;
  gap: 0.4rem;
}
.search-input {
  flex: 1;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.55rem 0.75rem;
  font-size: 0.95rem;
}
.campaign-filter {
  min-width: 140px;
  font-size: 0.9rem;
}
.search-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex: 1;
  overflow: auto;
}
.search-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.45rem 0.6rem;
  background: #f8f9ff;
  transition: all 0.2s ease;
}
.search-item:hover {
  background: #eef1ff;
  border-color: #d0d7ff;
}
.search-item-main {
  flex: 1;
  cursor: pointer;
  min-width: 0;
}
.search-item-title {
  font-weight: 700;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.search-item-badge {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
}
.badge-servant {
  background: #e8eaf6;
  color: #5c6bc0;
}
.badge-master {
  background: #fce4ec;
  color: #e91e63;
}
.search-item-sub {
  color: var(--color-text-secondary);
  font-size: 0.8rem;
  margin-top: 0.1rem;
}
.search-item-actions {
  display: flex;
  gap: 0.3rem;
  flex-shrink: 0;
}
.search-loading,
.empty-tip {
  color: var(--color-text-secondary);
  font-size: 0.95rem;
}

/* ===== 右侧预览面板 ===== */
.preview-panel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}
.preview-empty {
  border: 2px dashed #d0d0d0;
  border-radius: 0.75rem;
  padding: 2rem 1rem;
  text-align: center;
  color: #aaa;
}
.preview-empty-icon {
  font-size: 2.5rem;
  margin-bottom: 0.75rem;
}
.preview-empty-text {
  font-size: 0.9rem;
  line-height: 1.6;
}
.card-section {
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.6rem 0.8rem;
  background: #fff;
}
.card-section h3 {
  margin: 0 0 0.3rem;
  font-size: 0.9rem;
}
.card-section ul {
  margin: 0;
  padding-left: 1rem;
  color: var(--color-text-secondary);
  font-size: 0.85rem;
}
.card-section p {
  margin: 0.1rem 0;
  font-size: 0.85rem;
}

/* ===== 页面标题 ===== */
.page-title {
  margin: 0;
  font-size: 1.5rem;
}
.page-subtitle {
  margin: 0.2rem 0 0;
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}
</style>

