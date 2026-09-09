<script setup>
// 发动统计面板：按人物分组统计已生效技能/宝具，组内按规则书 5.2 结算链排序
// 点击技能名可触发 view-skill 事件，由父页面打开原文弹层
import { computed, ref } from 'vue'
import { PHASES, STATUS } from '../../composables/useBattlePhaseBoard'
import {
  sortSkillsBySettlementChain,
  groupSkillsByCharacter,
  isKnownType,
  isKnownRank,
} from '../../composables/settlementOrder'

const props = defineProps({
  queue: { type: Array, required: true },
  collapsed: { type: Boolean, default: false },
})

const emit = defineEmits(['view-skill'])

// 视图模式：byCharacter = 按人物分组（统计每人发了什么）；flat = 全局按结算链平铺
const viewMode = ref('byCharacter')
const isCollapsed = ref(props.collapsed)

const phaseLabels = Object.fromEntries(PHASES.map(phase => [phase.key, phase.label]))

// 只统计已生效的条目：常驻自动生效 + 手动勾选生效
const activeItems = computed(() =>
  props.queue.filter(item => item.status === STATUS.AUTO_ON || item.status === STATUS.APPLIED)
)

const groups = computed(() => groupSkillsByCharacter(activeItems.value))
const flatItems = computed(() => sortSkillsBySettlementChain(activeItems.value))

const unknownTypeCount = computed(() =>
  activeItems.value.filter(item => !isKnownType(item)).length
)

function toggleCollapsed() {
  isCollapsed.value = !isCollapsed.value
}

function unknownTypeTip(item) {
  return isKnownType(item) ? '' : '类型未标定（模板库缺类型字段），排链尾'
}
</script>

<template>
  <section class="settlement-order-panel">
    <header class="panel-header">
      <h3>发动统计 <small>{{ activeItems.length }} 项</small></h3>
      <div class="header-actions">
        <div v-if="!isCollapsed" class="view-toggle">
          <button
            type="button"
            :class="{ active: viewMode === 'byCharacter' }"
            @click="viewMode = 'byCharacter'"
          >按人物</button>
          <button
            type="button"
            :class="{ active: viewMode === 'flat' }"
            @click="viewMode = 'flat'"
          >按结算链</button>
        </div>
        <button type="button" class="collapse-btn" @click="toggleCollapsed">
          {{ isCollapsed ? '展开' : '收起' }}
        </button>
      </div>
    </header>

    <p v-if="unknownTypeCount > 0 && !isCollapsed" class="unknown-hint">
      {{ unknownTypeCount }} 项类型未标定（去技能模板库补类型后可正确排序）
    </p>

    <template v-if="!isCollapsed">
      <div v-if="activeItems.length === 0" class="empty-state">
        还没有已生效的技能/宝具。在工序队列里把技能标记为「生效」后会出现在这里。
      </div>

      <!-- 按人物分组视图：统计每个人发了什么，组内按结算链排序 -->
      <div v-else-if="viewMode === 'byCharacter'" class="group-list">
        <div v-for="group in groups" :key="group.key" class="character-group">
          <h4 class="character-name">
            <span class="side-dot" :class="group.side" />
            {{ group.characterName }}
            <small>{{ group.items.length }}</small>
          </h4>
          <ul class="skill-list">
            <li v-for="item in group.items" :key="item.id" class="skill-row">
              <button type="button" class="skill-name-btn" @click="emit('view-skill', item)">
                {{ item.skillName }}
              </button>
              <span class="badges">
                <span class="badge ability">{{ item.abilityKind || '未知能力' }}</span>
                <span v-if="item.abilityKind === '宝具' && item.npType" class="badge type">{{ item.npType }}</span>
                <span v-else-if="item.abilityKind !== '宝具' && item.skillType" class="badge type">{{ item.skillType }}</span>
                <span v-if="!isKnownType(item)" class="badge warn" :title="unknownTypeTip(item)">类型?</span>
                <span class="badge rank">{{ item.effectiveRank || item.originalRank || '等级?' }}</span>
                <span v-if="!isKnownRank(item.effectiveRank || item.originalRank)" class="badge warn">等级?</span>
              </span>
              <span class="phase-tag">{{ phaseLabels[item.phase] || item.phase }}</span>
              <span v-if="item.manualJudgment" class="manual-tag">需裁决</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- 全局平铺视图：跨人物按结算链排序，看整场战斗的结算顺序 -->
      <ol v-else class="flat-list">
        <li v-for="(item, index) in flatItems" :key="item.id" class="skill-row">
          <span class="order-no">{{ index + 1 }}</span>
          <button type="button" class="skill-name-btn" @click="emit('view-skill', item)">
            {{ item.skillName }}
          </button>
          <span class="character-tag">{{ item.characterName }}</span>
          <span class="badges">
            <span class="badge ability">{{ item.abilityKind || '未知能力' }}</span>
            <span v-if="item.abilityKind === '宝具' && item.npType" class="badge type">{{ item.npType }}</span>
            <span v-else-if="item.abilityKind !== '宝具' && item.skillType" class="badge type">{{ item.skillType }}</span>
            <span class="badge rank">{{ item.effectiveRank || item.originalRank || '等级?' }}</span>
          </span>
          <span class="phase-tag">{{ phaseLabels[item.phase] || item.phase }}</span>
          <span v-if="item.manualJudgment" class="manual-tag">需裁决</span>
        </li>
      </ol>
    </template>
  </section>
</template>

<style scoped>
.settlement-order-panel {
  margin-top: 1rem;
  padding: 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: #fff;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.panel-header h3 {
  margin: 0;
  color: var(--color-primary-dark);
  font-size: 1rem;
}

.panel-header h3 small {
  color: var(--color-text-secondary);
  font-weight: 400;
  margin-left: 0.3rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.view-toggle {
  display: flex;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  overflow: hidden;
}

.view-toggle button {
  border: none;
  padding: 0.3rem 0.7rem;
  background: #fff;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 0.8rem;
}

.view-toggle button.active {
  background: var(--color-primary);
  color: #fff;
}

.collapse-btn {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 0.3rem 0.7rem;
  background: #fff;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 0.8rem;
}

.unknown-hint {
  margin: 0.5rem 0 0;
  padding: 0.4rem 0.65rem;
  border-radius: 8px;
  background: #fff7e3;
  color: var(--color-accent);
  font-size: 0.8rem;
}

.empty-state {
  margin-top: 0.6rem;
  padding: 0.9rem;
  border: 1px dashed var(--color-border);
  border-radius: 10px;
  color: var(--color-text-secondary);
  font-size: 0.85rem;
  text-align: center;
}

.character-group + .character-group {
  margin-top: 0.75rem;
}

.character-name {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0 0 0.35rem;
  font-size: 0.88rem;
  color: var(--color-primary-dark);
}

.character-name small {
  color: var(--color-text-secondary);
  font-weight: 400;
}

.side-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.side-dot.blue {
  background: #3b6fd4;
}

.side-dot.yellow {
  background: #d4a83b;
}

.skill-list,
.flat-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.skill-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0.3rem 0;
  font-size: 0.84rem;
}

.skill-row + .skill-row {
  border-top: 1px solid var(--color-border);
}

.order-no {
  min-width: 1.4rem;
  color: var(--color-text-secondary);
  font-size: 0.78rem;
}

.skill-name-btn {
  border: none;
  background: none;
  padding: 0;
  color: var(--color-primary);
  cursor: pointer;
  font-size: 0.84rem;
  font-weight: 600;
  text-align: left;
}

.skill-name-btn:hover {
  text-decoration: underline;
}

.character-tag {
  color: var(--color-text-secondary);
  font-size: 0.78rem;
}

.badges {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.badge {
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  font-size: 0.72rem;
  background: #eef2f8;
  color: var(--color-primary);
}

.badge.type {
  background: #f0f6ee;
  color: #3f7a4d;
}

.badge.rank {
  background: #fdf3e7;
  color: var(--color-accent);
}

.badge.warn {
  background: #fdeaea;
  color: #b04040;
}

.phase-tag {
  margin-left: auto;
  color: var(--color-text-secondary);
  font-size: 0.75rem;
}

.manual-tag {
  color: #b04040;
  font-size: 0.75rem;
  font-weight: 600;
}
</style>
