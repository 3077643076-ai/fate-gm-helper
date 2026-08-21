<script setup>
import { STATUS, resolveManualJudgmentForStatusUpdate } from '../../composables/useBattlePhaseBoard'

defineProps({
  phaseLabel: { type: String, required: true },
  queue: { type: Array, required: true },
  selectedSkillId: { type: String, default: '' },
})

const emit = defineEmits(['select-skill', 'update-skill'])

const rankOptions = ['EX', 'A', 'B', 'C', 'D', 'E', '无效']
const statOptions = [
  { key: '', label: '不选择' },
  { key: 'strength', label: '筋力' },
  { key: 'endurance', label: '耐久' },
  { key: 'agility', label: '敏捷' },
  { key: 'mana', label: '魔力' },
  { key: 'luck', label: '幸运' },
  { key: 'noblePhantasm', label: '宝具' },
]

function patch(item, patchValue) {
  emit('update-skill', { ...item, ...patchValue })
}

function patchStatus(item, status) {
  patch(item, {
    status,
    manualJudgment: resolveManualJudgmentForStatusUpdate(item, status),
  })
}
</script>

<template>
  <section class="skill-queue-panel">
    <header class="queue-header">
      <div>
        <h2>{{ phaseLabel }}</h2>
        <p>确认本工序技能是否生效，必要时调整生效等级。</p>
      </div>
    </header>

    <div v-if="queue.length === 0" class="empty-queue">本工序没有待结算技能。</div>

    <article
      v-for="item in queue"
      :key="item.id"
      class="skill-queue-row"
      :class="{ selected: selectedSkillId === item.id, applied: item.status === STATUS.APPLIED || item.status === STATUS.AUTO_ON, disabled: item.status === STATUS.DISABLED }"
      @click="emit('select-skill', item.id)"
    >
      <div class="skill-row-main">
        <strong>{{ item.skillName }}</strong>
        <span>{{ item.characterName }} · {{ item.positionLabel }}</span>
        <small>原等级 {{ item.originalRank || '未填' }}</small>
      </div>

      <label>
        生效等级
        <select :value="item.effectiveRank" @change="patch(item, { effectiveRank: $event.target.value })">
          <option v-for="rank in rankOptions" :key="rank" :value="rank">{{ rank }}</option>
        </select>
      </label>

      <label>
        选择属性
        <select :value="item.selectedStat" @change="patch(item, { selectedStat: $event.target.value })">
          <option v-for="stat in statOptions" :key="stat.key" :value="stat.key">{{ stat.label }}</option>
        </select>
      </label>

      <div class="status-buttons">
        <button type="button" @click.stop="patchStatus(item, item.phase === 'PASSIVE' ? STATUS.AUTO_ON : STATUS.APPLIED)">生效</button>
        <button type="button" @click.stop="patchStatus(item, STATUS.DISABLED)">关闭</button>
        <button type="button" @click.stop="patchStatus(item, STATUS.MANUAL)">需裁决</button>
      </div>

      <textarea
        :value="item.gmNote"
        placeholder="GM 备注，例如：被对魔力降级为 C / 本场封印"
        @input="patch(item, { gmNote: $event.target.value })"
      />
    </article>
  </section>
</template>

<style scoped>
.skill-queue-panel {
  display: grid;
  gap: 0.75rem;
}

.queue-header {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 0.75rem;
}

.queue-header h2 {
  margin: 0;
  color: var(--color-primary-dark);
}

.queue-header p {
  margin: 0.25rem 0 0;
  color: var(--color-text-secondary);
  font-size: 0.86rem;
}

.btn-confirm-phase {
  border: none;
  border-radius: 999px;
  padding: 0.55rem 0.9rem;
  color: #fff;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  cursor: pointer;
}

.empty-queue {
  padding: 1rem;
  border: 1px dashed var(--color-border);
  border-radius: 12px;
  color: var(--color-text-secondary);
  background: var(--color-card-soft);
  text-align: center;
}

.skill-queue-row {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 120px 140px auto;
  gap: 0.75rem;
  align-items: start;
  padding: 0.85rem;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
}

.skill-queue-row.selected {
  border-color: var(--color-accent);
  background: #fffaf0;
}

.skill-queue-row.applied {
  border-color: rgba(30, 125, 79, 0.35);
  background: #f0fbf5;
}

.skill-queue-row.disabled {
  opacity: 0.65;
}

.skill-row-main {
  display: grid;
  gap: 0.2rem;
}

.skill-row-main strong {
  color: var(--color-primary-dark);
}

.skill-row-main span,
.skill-row-main small,
.skill-queue-row label {
  color: var(--color-text-secondary);
  font-size: 0.82rem;
}

.skill-queue-row label {
  display: grid;
  gap: 0.3rem;
}

.skill-queue-row select,
.skill-queue-row textarea {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  color: var(--color-text-primary);
  background: #fff;
}

.skill-queue-row select {
  padding: 0.35rem 0.5rem;
}

.skill-queue-row textarea {
  grid-column: 1 / -1;
  min-height: 3rem;
  padding: 0.45rem;
}

.status-buttons {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.status-buttons button {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 0.35rem 0.6rem;
  color: var(--color-primary);
  background: #fff;
  cursor: pointer;
}

@media (max-width: 900px) {
  .queue-header,
  .skill-queue-row {
    grid-template-columns: 1fr;
  }
}
</style>
