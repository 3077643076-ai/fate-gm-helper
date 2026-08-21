<script setup>
defineProps({
  skill: { type: Object, default: null },
  phaseEffects: { type: Object, required: true },
})
</script>

<template>
  <section class="impact-preview">
    <h3>技能影响预览</h3>
    <div v-if="!skill" class="empty-preview">选择一个技能查看影响。</div>
    <template v-else>
      <h4>{{ skill.skillName }}</h4>
      <p class="preview-meta">
        {{ skill.characterName }} · 原等级 {{ skill.originalRank || '未填' }} · 生效等级 {{ skill.effectiveRank || '未填' }}
      </p>
      <p v-if="skill.selectedStat">选择属性：{{ skill.selectedStat }}</p>
      <p v-if="skill.gmNote">GM 备注：{{ skill.gmNote }}</p>
      <details v-if="skill.template?.rawText" open>
        <summary>技能原文</summary>
        <pre>{{ skill.template.rawText }}</pre>
      </details>
      <div class="preview-effects">
        <strong>当前工序影响</strong>
        <ul v-if="phaseEffects.applied.length || phaseEffects.manual.length">
          <li v-for="line in phaseEffects.applied" :key="line">{{ line }}</li>
          <li v-for="line in phaseEffects.manual" :key="line">{{ line }}</li>
        </ul>
        <p v-else class="empty-preview">当前工序暂无已套用或待裁决效果。</p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.impact-preview {
  margin-bottom: 1rem;
}

.impact-preview h3 {
  margin: 0 0 0.75rem;
  color: var(--color-primary-dark);
}

.impact-preview h4 {
  margin: 0.6rem 0 0.35rem;
  color: var(--color-primary-dark);
}

.preview-meta,
.empty-preview,
.preview-effects p {
  color: var(--color-text-secondary);
  font-size: 0.88rem;
}

.impact-preview pre {
  white-space: pre-wrap;
  max-height: 180px;
  overflow: auto;
  padding: 0.65rem;
  border-radius: 10px;
  background: #f8f5ec;
}

.preview-effects ul {
  margin: 0.45rem 0 0;
  padding-left: 1.1rem;
}
</style>
