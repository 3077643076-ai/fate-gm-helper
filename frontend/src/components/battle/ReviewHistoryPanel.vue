<template>
  <!-- 复盘历史：只负责展示和选择，不直接请求后端。 -->
  <section class="review-history-panel">
    <header class="review-history-header">
      <h3>复盘历史</h3>
      <button type="button" class="btn-mini" @click="$emit('refresh')" :disabled="loading">
        {{ loading ? '刷新中' : '刷新' }}
      </button>
    </header>
    <p v-if="items.length === 0" class="hint">暂无已保存复盘。确认结算后会自动保存。</p>
    <div v-else class="review-list">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="review-item"
        :class="{ active: selectedId === item.id }"
        @click="$emit('select', selectedId === item.id ? null : item.id)"
      >
        <span>{{ item.title || `第${item.turnNumber || '-'}回合战斗复盘` }}</span>
        <small>{{ formatDate(item.createdAt) }}</small>
      </button>
    </div>
    <pre v-if="selectedReview" class="review-summary">{{ selectedReview.summaryText || '暂无摘要文本' }}</pre>
  </section>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  items: { type: Array, default: () => [] },
  selectedId: { type: Number, default: null },
  loading: { type: Boolean, default: false },
  formatDate: { type: Function, required: true },
})

defineEmits(['refresh', 'select'])

const selectedReview = computed(() => props.items.find(item => item.id === props.selectedId) || null)
</script>
