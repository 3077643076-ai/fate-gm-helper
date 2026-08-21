<script setup>
import { computed } from 'vue'

const props = defineProps({
  winRateChain: { type: Object, required: true },
  statComparisonSummary: { type: Object, required: true },
  warnings: { type: Array, default: () => [] },
  activatedSummary: { type: Array, default: () => [] },
})

const visibleWarnings = computed(() => props.warnings.slice(0, 5))
const hiddenWarningCount = computed(() => Math.max(0, props.warnings.length - visibleWarnings.value.length))
const nextWarning = computed(() => props.warnings[0] || '')
</script>

<template>
  <section class="battle-summary-panel">
    <h3>战斗摘要</h3>
    <div class="summary-kpi">
      <span>基础胜率</span>
      <strong>{{ statComparisonSummary.baseWinRate }}%</strong>
    </div>
    <div class="summary-kpi">
      <span>蓝方最终</span>
      <strong>{{ winRateChain.blueFinal }}%</strong>
    </div>
    <div class="summary-kpi">
      <span>黄方最终</span>
      <strong>{{ winRateChain.yellowFinal }}%</strong>
    </div>
    <div class="summary-kpi">
      <span>双方胜率 K</span>
      <strong>{{ winRateChain.blueK }} / {{ winRateChain.yellowK }}</strong>
    </div>

    <div class="summary-status" :class="warnings.length ? 'has-warning' : 'is-ready'">
      <strong>{{ warnings.length ? `还有 ${warnings.length} 项待处理` : '可以进入结算确认' }}</strong>
      <span v-if="nextWarning">下一项：{{ nextWarning }}</span>
      <span v-else>所有工序提示已清空。</span>
    </div>

    <div v-if="activatedSummary.length" class="summary-block">
      <h4>已结算效果</h4>
      <ul><li v-for="line in activatedSummary" :key="line">{{ line }}</li></ul>
    </div>

    <div v-if="warnings.length" class="summary-block warning-block">
      <h4>未处理提示</h4>
      <ul><li v-for="line in visibleWarnings" :key="line">{{ line }}</li></ul>
      <p v-if="hiddenWarningCount" class="more-warning">还有 {{ hiddenWarningCount }} 项，切换工序继续处理。</p>
    </div>
  </section>
</template>

<style scoped>
.battle-summary-panel {
  margin-bottom: 1rem;
}

.battle-summary-panel h3 {
  margin: 0 0 0.75rem;
  color: var(--color-primary-dark);
}

.battle-summary-panel h4 {
  margin: 0.6rem 0 0.35rem;
  color: var(--color-primary-dark);
}

.summary-kpi {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.35rem 0;
  border-bottom: 1px solid var(--color-border);
}

.summary-kpi strong {
  color: var(--color-accent);
}

.summary-block {
  margin-top: 0.8rem;
}

.summary-block ul {
  margin: 0.45rem 0 0;
  padding-left: 1.1rem;
}

.summary-status {
  display: grid;
  gap: 0.25rem;
  margin-top: 0.75rem;
  padding: 0.65rem;
  border-radius: 10px;
  font-size: 0.86rem;
}

.summary-status span {
  color: var(--color-text-secondary);
}

.summary-status.has-warning {
  border: 1px solid #e0b15b;
  background: #fff7e3;
}

.summary-status.is-ready {
  border: 1px solid #8bc69a;
  background: #effaf2;
}

.warning-block {
  padding: 0.65rem;
  border-radius: 10px;
  background: #fff7e3;
}

.more-warning {
  margin: 0.45rem 0 0;
  color: var(--color-text-secondary);
  font-size: 0.82rem;
}
</style>
