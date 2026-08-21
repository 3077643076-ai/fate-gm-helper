<template>
  <!-- 主要工序：给 GM 一个专门的摘要视图，避免只盯着长技能队列。 -->
  <section v-if="visible" class="main-phase-panel">
    <header>
      <h3>主要工序处理重点</h3>
      <p class="hint">优先检查宝具、需 GM 裁决项和已生效效果；复杂规则仍以 GM 手动裁决为准。</p>
    </header>

    <div class="main-phase-grid">
      <div class="main-phase-card">
        <h4>宝具 / 核心技能</h4>
        <ul v-if="nobleItems.length">
          <li v-for="item in nobleItems" :key="item.id">
            <strong>{{ item.skillName }}</strong>
            <span>{{ item.characterName }} · {{ item.positionLabel }} · {{ statusText(item) }}</span>
          </li>
        </ul>
        <p v-else class="empty-main-phase">本工序没有识别到宝具项。</p>
      </div>

      <div class="main-phase-card">
        <h4>需裁决</h4>
        <ul v-if="manualItems.length">
          <li v-for="item in manualItems" :key="item.id">
            <strong>{{ item.skillName }}</strong>
            <span>{{ item.gmNote || '请记录 GM 裁决结果' }}</span>
          </li>
        </ul>
        <p v-else class="empty-main-phase">暂无需裁决项。</p>
      </div>

      <div class="main-phase-card">
        <h4>已生效</h4>
        <ul v-if="activeItems.length">
          <li v-for="item in activeItems" :key="item.id">
            <strong>{{ item.skillName }}</strong>
            <span>{{ item.characterName }} · {{ item.positionLabel }}</span>
          </li>
        </ul>
        <p v-else class="empty-main-phase">暂无已生效项。</p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { STATUS, isNobleOrCoreSkill } from '../../composables/useBattlePhaseBoard'

const props = defineProps({
  visible: { type: Boolean, default: false },
  queue: { type: Array, default: () => [] },
})

const activeStatuses = new Set([STATUS.AUTO_ON, STATUS.APPLIED])

const nobleItems = computed(() => props.queue.filter(isNobleOrCoreSkill))

const manualItems = computed(() => props.queue.filter(item => item.status === STATUS.MANUAL || item.manualJudgment || item.gmNote))
const activeItems = computed(() => props.queue.filter(item => activeStatuses.has(item.status)))

function statusText(item) {
  if (item.status === STATUS.APPLIED || item.status === STATUS.AUTO_ON) return '已生效'
  if (item.status === STATUS.MANUAL || item.manualJudgment) return '需裁决'
  if (item.status === STATUS.DISABLED) return '关闭'
  return '待确认'
}
</script>

<style scoped>
.main-phase-panel {
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: #fff;
}

.main-phase-panel h3,
.main-phase-panel h4 {
  margin: 0;
  color: var(--color-primary-dark);
}

.main-phase-panel .hint {
  margin: 0.3rem 0 0;
  color: var(--color-text-secondary);
  font-size: 0.86rem;
}

.main-phase-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.main-phase-card {
  display: grid;
  gap: 0.55rem;
  padding: 0.8rem;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-card-soft);
}

.main-phase-card ul {
  display: grid;
  gap: 0.45rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.main-phase-card li {
  display: grid;
  gap: 0.15rem;
}

.main-phase-card strong {
  color: var(--color-text-primary);
}

.main-phase-card span,
.empty-main-phase {
  color: var(--color-text-secondary);
  font-size: 0.83rem;
}

@media (max-width: 900px) {
  .main-phase-grid {
    grid-template-columns: 1fr;
  }
}
</style>
