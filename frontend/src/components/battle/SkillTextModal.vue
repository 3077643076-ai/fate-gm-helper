<script setup>
// 技能原文弹层：点击任意技能名后快速查看文本
// 原文来源优先级：模板库原文 → 队列条目全文（.st 卡描述拼在名字里）→ 整卡原文兜底
import { computed } from 'vue'

const props = defineProps({
  skill: { type: Object, default: null },
  open: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

// 依次尝试三种原文来源，返回第一个非空值
const rawText = computed(() => {
  if (!props.skill) return ''
  return props.skill.template?.rawText
    || (props.skill.skillName && props.skill.skillName.length > props.skill.skillName.split(/\s/)[0].length
      ? props.skill.skillName
      : '')
    || props.skill.cardRawText
    || ''
})

const rawTextSource = computed(() => {
  if (!props.skill) return ''
  if (props.skill.template?.rawText) return '模板库原文'
  if (rawText.value === props.skill.skillName) return '角色卡技能全文'
  if (rawText.value === props.skill.cardRawText) return '整卡原文（未匹配到更精确的技能文本）'
  return ''
})

// 模板结构化效果行，方便 GM 不看原文也能快速核对数值
const effectLines = computed(() => {
  const template = props.skill?.template
  if (!template) return []
  const effects = Array.isArray(template.effects) ? template.effects : []
  const lines = effects.map(effect => {
    const valueText = effect.valueByRank || effect.values ? '按等级取值' : `${effect.value > 0 ? '+' : ''}${effect.value ?? ''}`
    if (effect.kind === 'stat_modifier') return `属性修正 ${effect.stat} ${valueText}`
    if (effect.kind === 'stat_group_modifier') return `属性组 ${effect.group} ${valueText}`
    if (effect.kind === 'select_stat_modifier') return `自选属性 ${valueText}`
    if (effect.kind === 'win_rate_modifier') return `己方胜率 ${valueText}`
    if (effect.kind === 'enemy_win_rate_modifier') return `敌方胜率 ${valueText}`
    if (effect.kind === 'guarantee_modifier') return `保底 ${valueText}`
    if (effect.kind === 'mana_cost') return `魔力消耗 ${effect.value}`
    return effect.label || effect.text || '需 GM 裁决'
  })
  return lines
})

function close() {
  emit('close')
}
</script>

<template>
  <teleport to="body">
    <div v-if="open && skill" class="modal-mask" @click.self="close">
      <article class="modal-card">
        <header class="modal-header">
          <div>
            <h3>{{ skill.skillName }}</h3>
            <p class="meta">
              <span v-if="skill.characterName">{{ skill.characterName }}</span>
              <span v-if="skill.abilityKind">{{ skill.abilityKind }}</span>
              <span v-if="skill.abilityKind === '宝具' && skill.npType">{{ skill.npType }}</span>
              <span v-if="skill.skillType">{{ skill.skillType }}</span>
              <span v-if="skill.effectiveRank || skill.originalRank">等级 {{ skill.effectiveRank || skill.originalRank }}</span>
            </p>
          </div>
          <button type="button" class="close-btn" @click="close">关闭</button>
        </header>

        <div v-if="skill.template" class="template-facts">
          <span v-if="skill.template.timing">时机：{{ skill.template.timing }}</span>
          <span v-if="skill.template.manaCost">魔力 {{ skill.template.manaCost }}</span>
          <span v-if="skill.template.winRateModifier">己方胜率 {{ skill.template.winRateModifier > 0 ? '+' : '' }}{{ skill.template.winRateModifier }}</span>
          <span v-if="skill.template.positionLimit && skill.template.positionLimit !== '不限'">限 {{ skill.template.positionLimit }}</span>
        </div>

        <ul v-if="effectLines.length" class="effect-list">
          <li v-for="line in effectLines" :key="line">{{ line }}</li>
        </ul>

        <p v-if="skill.gmNote" class="gm-note">GM 备注：{{ skill.gmNote }}</p>

        <section v-if="rawText" class="raw-text-section">
          <h4>{{ rawTextSource }}</h4>
          <pre>{{ rawText }}</pre>
        </section>
        <p v-else class="no-text-hint">
          模板库里还没有这个技能的原文。可以把原文录进技能模板库，之后全团都能直接查。
        </p>
      </article>
    </div>
  </teleport>
</template>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  background: rgba(20, 28, 48, 0.45);
  padding: 1rem;
}

.modal-card {
  width: min(640px, 100%);
  max-height: 82vh;
  overflow: auto;
  padding: 1.1rem 1.2rem;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 18px 48px rgba(20, 28, 48, 0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
}

.modal-header h3 {
  margin: 0;
  color: var(--color-primary-dark);
  font-size: 1.1rem;
}

.meta {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin: 0.35rem 0 0;
  color: var(--color-text-secondary);
  font-size: 0.82rem;
}

.close-btn {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 0.3rem 0.8rem;
  background: #fff;
  color: var(--color-text-secondary);
  cursor: pointer;
  white-space: nowrap;
}

.template-facts {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.75rem;
}

.template-facts span {
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: #eef2f8;
  color: var(--color-primary);
  font-size: 0.76rem;
}

.effect-list {
  margin: 0.6rem 0 0;
  padding-left: 1.1rem;
  color: var(--color-text-primary);
  font-size: 0.86rem;
}

.gm-note {
  margin: 0.6rem 0 0;
  color: var(--color-accent);
  font-size: 0.84rem;
}

.raw-text-section {
  margin-top: 0.8rem;
}

.raw-text-section h4 {
  margin: 0 0 0.35rem;
  color: var(--color-text-secondary);
  font-size: 0.8rem;
  font-weight: 600;
}

.raw-text-section pre {
  margin: 0;
  padding: 0.7rem;
  border-radius: 10px;
  background: #f8f5ec;
  white-space: pre-wrap;
  max-height: 300px;
  overflow: auto;
  font-size: 0.84rem;
}

.no-text-hint {
  margin: 0.8rem 0 0;
  padding: 0.7rem;
  border-radius: 10px;
  background: #fff7e3;
  color: var(--color-accent);
  font-size: 0.84rem;
}
</style>
