<template>
  <div>
    <div class="page-head">
      <h2>及时结算 · 提交当下立刻结算</h2>
      <p>不占回合行动的即时事件记录本</p>
    </div>

    <!-- 判定标准（静态口径，来源：规则书 3.3 / SOP） -->
    <div class="sheet">
      <h3 class="sheet-title">及时结算判定标准（三条同时满足）</h3>
      <ol class="rule-list">
        <li>发动时机 = 随时</li>
        <li>不消耗行动力（标"消耗行动"的走行动结算）</li>
        <li>作用对象 = 灵脉上的单位（对战斗位单位的"随时"必须战斗中开，走战斗表）</li>
      </ol>
      <p class="sheet-note">注：资源库元数据不标作用对象，按描述人工判定——描述含战斗位/工序/解放 = 战斗系。</p>
    </div>

    <!-- 记录表 -->
    <div class="sheet">
      <h3 class="sheet-title">及时结算记录</h3>
      <p class="sheet-note">记录暂存本机浏览器（localStorage），后端台账属于后续批次；换电脑不跟随。</p>
      <div class="add-row">
        <input v-model="draft.time" class="input time-input" placeholder="时间 14:05" />
        <input v-model="draft.actor" class="input" placeholder="角色 / 单位" />
        <input v-model="draft.event" class="input" placeholder="事项，如 真名猜测 Saber" />
        <input v-model="draft.result" class="input" placeholder="判定/结果" />
        <input v-model="draft.note" class="input" placeholder="备注（可空）" />
        <button class="btn" :disabled="!campaignId" @click="addRecord">记一笔</button>
      </div>

      <table v-if="records.length" class="sheet-table">
        <thead><tr><th>时间</th><th>角色</th><th>事项</th><th>判定/结果</th><th>备注</th><th></th></tr></thead>
        <tbody>
          <tr v-for="(r, i) in records" :key="r.id">
            <td>{{ r.time }}</td>
            <td>{{ r.actor }}</td>
            <td>{{ r.event }}</td>
            <td :class="{ 'cell-auto': r.result }">{{ r.result || '—' }}</td>
            <td>{{ r.note || '—' }}</td>
            <td><button class="btn small danger" @click="removeRecord(i)">删</button></td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-tip">本战役暂无及时结算记录。</p>
    </div>

    <!-- 待确认队列 -->
    <div class="sheet">
      <h3 class="sheet-title">待确认队列</h3>
      <p class="empty-tip">转魔待对方确认、需 GM 事后追认的即时项——目前转魔申报在机器人台账（data/magic-transfers.jsonl），确认流属后续批次。</p>
    </div>
  </div>
</template>

<script setup>
// 及时结算页：口径说明 + 本机暂存的记录表（localStorage 按战役分 key）
import { ref, reactive, computed, watch } from 'vue'
import { useCurrentCampaign } from '../../composables/useCurrentCampaign'

const { current } = useCurrentCampaign()
const campaignId = computed(() => current.value?.id)

const records = ref([])
const draft = reactive({ time: '', actor: '', event: '', result: '', note: '' })

// localStorage key 按战役隔离
function storageKey() {
  return `instant-settlement-${campaignId.value || 'none'}`
}

function load() {
  try {
    records.value = JSON.parse(localStorage.getItem(storageKey()) || '[]')
  } catch {
    records.value = []
  }
}

function save() {
  localStorage.setItem(storageKey(), JSON.stringify(records.value))
}

function addRecord() {
  if (!draft.actor.trim() && !draft.event.trim()) return
  records.value.unshift({
    id: Date.now(),
    time: draft.time.trim() || new Date().toTimeString().slice(0, 5),
    actor: draft.actor.trim(),
    event: draft.event.trim(),
    result: draft.result.trim(),
    note: draft.note.trim(),
  })
  save()
  draft.time = draft.actor = draft.event = draft.result = draft.note = ''
}

function removeRecord(index) {
  records.value.splice(index, 1)
  save()
}

watch(campaignId, load, { immediate: true })
</script>

<style scoped>
.rule-list { margin: 0; padding-left: 1.2rem; font-size: 0.88rem; line-height: 1.9; }
.add-row { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.8rem; }
.add-row .input { flex: 1; min-width: 110px; }
.time-input { max-width: 90px; flex: none !important; }
</style>
