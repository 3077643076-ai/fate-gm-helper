<template>
  <div>
    <div class="page-head">
      <h2>战役管理</h2>
      <p>新建 / 选择 / 删除战役；顶栏的"选择战役"和这里是同一份数据</p>
    </div>

    <!-- 新建战役 -->
    <div class="sheet">
      <h3 class="sheet-title">新建战役</h3>
      <div class="create-row">
        <input v-model="newName" class="input" placeholder="战役名称，如 三国杯" @keydown.enter="doCreate" />
        <input v-model="newDesc" class="input desc-input" placeholder="描述（可空）" @keydown.enter="doCreate" />
        <button class="btn primary" :disabled="creating || !newName.trim()" @click="doCreate">
          {{ creating ? '创建中…' : '创建' }}
        </button>
      </div>
      <p v-if="formMsg" class="sheet-note">{{ formMsg }}</p>
    </div>

    <!-- 战役列表 -->
    <div class="sheet">
      <h3 class="sheet-title">战役列表（{{ campaigns.length }}）</h3>
      <table v-if="campaigns.length" class="sheet-table">
        <thead><tr><th>ID</th><th>名称</th><th>描述</th><th>当前选中</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="c in campaigns" :key="c.id">
            <td>{{ c.id }}</td>
            <td>{{ c.name }}</td>
            <td>{{ c.description || '—' }}</td>
            <td :class="{ 'cell-auto': current?.id === c.id }">
              <span v-if="current?.id === c.id" class="dot ok" />{{ current?.id === c.id ? '使用中' : '' }}
            </td>
            <td class="op-cell">
              <button v-if="current?.id !== c.id" class="btn small" @click="doSelect(c)">切换到此战役</button>
              <button class="btn small danger" @click="doDelete(c)">删</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-tip">还没有战役。先在上面创建一个。</p>
    </div>

    <!-- 游戏版本管理（占位） -->
    <div class="sheet">
      <h3 class="sheet-title">游戏版本管理</h3>
      <p class="empty-tip">版本列表 + 规则数据随版本切换，属于后续批次。</p>
    </div>
  </div>
</template>

<script setup>
// 战役管理页：新建/切换/删除，与顶栏共享 useCurrentCampaign 状态
import { ref } from 'vue'
import { useCurrentCampaign } from '../../composables/useCurrentCampaign'
import { createCampaign, deleteCampaign } from '../../services/campaign'

const { campaigns, current, refreshList, switchTo } = useCurrentCampaign()

const newName = ref('')
const newDesc = ref('')
const creating = ref(false)
const formMsg = ref('')

async function doCreate() {
  creating.value = true
  formMsg.value = ''
  try {
    await createCampaign(newName.value.trim(), newDesc.value.trim() || undefined)
    newName.value = ''
    newDesc.value = ''
    await refreshList()
    formMsg.value = '已创建'
  } catch (e) {
    formMsg.value = `创建失败：${e.message}`
  } finally {
    creating.value = false
  }
}

async function doSelect(c) {
  await switchTo(c.id)
}

async function doDelete(c) {
  if (!window.confirm(`确认删除战役「${c.name}」？其下属角色卡/回合/灵脉数据将不可访问，操作不可撤销。`)) return
  try {
    await deleteCampaign(c.id)
    await refreshList()
  } catch (e) {
    formMsg.value = `删除失败：${e.message}`
  }
}
</script>

<style scoped>
.create-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.create-row .input { flex: 1; min-width: 160px; }
.desc-input { flex: 2 !important; }
.op-cell { white-space: nowrap; }
.op-cell .btn + .btn { margin-left: 0.35rem; }
</style>
