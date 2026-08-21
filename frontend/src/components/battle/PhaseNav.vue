<script setup>
defineProps({
  phases: { type: Array, required: true },
  currentPhase: { type: String, required: true },
  phaseState: { type: Object, required: true },
  warningsByPhase: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['select'])
</script>

<template>
  <aside class="phase-nav">
    <button
      v-for="phase in phases"
      :key="phase.key"
      type="button"
      class="phase-nav-item"
      :class="{ active: currentPhase === phase.key, confirmed: phaseState.phases?.[phase.key]?.confirmed }"
      @click="emit('select', phase.key)"
    >
      <span>{{ phase.label }}</span>
      <small v-if="warningsByPhase[phase.key]">{{ warningsByPhase[phase.key] }} 项待处理</small>
      <small v-else-if="phaseState.phases?.[phase.key]?.confirmed">已确认</small>
      <small v-else>未确认</small>
    </button>
  </aside>
</template>

<style scoped>
.phase-nav {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: #fff;
  box-shadow: var(--shadow-md);
  position: sticky;
  top: 1rem;
  padding: 0.75rem;
}

.phase-nav-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
  padding: 0.65rem 0.75rem;
  margin-bottom: 0.4rem;
  border: 1px solid transparent;
  border-radius: 12px;
  color: var(--color-text-secondary);
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.phase-nav-item:last-child {
  margin-bottom: 0;
}

.phase-nav-item.active {
  border-color: var(--color-accent);
  color: var(--color-primary-dark);
  background: #fffaf0;
}

.phase-nav-item.confirmed small {
  color: #1e7d4f;
}

@media (max-width: 1100px) {
  .phase-nav {
    position: static;
  }
}
</style>
