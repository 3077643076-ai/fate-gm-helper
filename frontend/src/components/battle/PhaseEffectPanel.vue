<template>
  <!-- 当前工序效果：集中展示本阶段已经自动套用/需要裁决的内容。 -->
  <section class="phase-detail-panel">
    <h3>当前工序效果</h3>
    <div v-if="selectedSkill" class="selected-skill-card">
      <strong>{{ selectedSkill.skillName }}</strong>
      <span>{{ selectedSkill.characterName }} / {{ selectedSkill.positionLabel }}</span>
      <small>状态：{{ selectedSkill.status }}；阶段：{{ phaseLabel }}</small>
    </div>
    <div class="phase-effect-grid">
      <div><span>蓝方属性</span><strong>{{ formatStatBonus(effects.blueStats) }}</strong></div>
      <div><span>蓝方胜率</span><strong>{{ signed(effects.blueWinRate) }}</strong></div>
      <div><span>黄方胜率</span><strong>{{ signed(effects.yellowWinRate) }}</strong></div>
    </div>
    <ul v-if="effectLines.length" class="phase-effect-list">
      <li v-for="line in effectLines" :key="line">{{ line }}</li>
    </ul>
    <ul v-if="warnings.length" class="phase-warning-list">
      <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
    </ul>
  </section>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  selectedSkill: { type: Object, default: null },
  phaseLabel: { type: String, required: true },
  effects: { type: Object, required: true },
  warnings: { type: Array, default: () => [] },
  formatStatBonus: { type: Function, required: true },
  signed: { type: Function, required: true },
})

const effectLines = computed(() => [
  ...(props.effects.applied || []),
  ...(props.effects.manual || []),
])
</script>
