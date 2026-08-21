<template>
  <!-- 工序确认条：结算锁定前可以确认或撤回当前工序。 -->
  <div class="phase-confirm-bar" :class="{ confirmed: isConfirmed }">
    <div>
      <strong>{{ phaseLabel }}</strong>
      <span>{{ statusText }}</span>
    </div>
    <div class="phase-confirm-actions">
      <button type="button" class="btn-confirm-phase" @click="$emit('confirm')" :disabled="settlementConfirmed || isConfirmed">
        {{ isConfirmed ? '已确认' : '确认本工序' }}
      </button>
      <button type="button" class="btn-phase-reopen" @click="$emit('reopen')" :disabled="settlementConfirmed || !isConfirmed">
        撤回确认
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  phaseLabel: { type: String, required: true },
  isConfirmed: { type: Boolean, default: false },
  settlementConfirmed: { type: Boolean, default: false },
})

defineEmits(['confirm', 'reopen'])

const statusText = computed(() => {
  if (props.settlementConfirmed) return '战斗表已锁定，不能再修改工序确认状态'
  return props.isConfirmed ? '本工序已确认，可在结算前撤回' : '本工序尚未确认'
})
</script>

<style scoped>
.phase-confirm-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-card-soft);
}

.phase-confirm-bar.confirmed {
  border-color: rgba(30, 125, 79, 0.35);
  background: #f0fbf5;
}

.phase-confirm-bar strong {
  display: block;
  color: var(--color-primary-dark);
}

.phase-confirm-bar span {
  display: block;
  margin-top: 0.15rem;
  color: var(--color-text-secondary);
  font-size: 0.84rem;
}

.phase-confirm-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.btn-confirm-phase,
.btn-phase-reopen {
  border: none;
  border-radius: 999px;
  padding: 0.55rem 0.9rem;
  cursor: pointer;
}

.btn-confirm-phase {
  color: #fff;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
}

.btn-phase-reopen {
  color: var(--color-primary);
  background: #fff;
  border: 1px solid var(--color-border);
}

.btn-confirm-phase:disabled,
.btn-phase-reopen:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 700px) {
  .phase-confirm-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .phase-confirm-actions {
    justify-content: flex-start;
  }
}
</style>
