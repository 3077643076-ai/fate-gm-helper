<template>
  <!-- 战斗开始时：战术、战前修正、魔力消耗集中在这里。 -->
  <div v-if="visible" class="phase-stack">
    <section class="tactics-section">
      <h2>战术选择</h2>
      <p class="hint">规则时点：战斗开始时能力结算完毕后，双方主力位再同时提交战术。</p>
      <div class="tactics-row">
        <div class="tactic-group">
          <label>蓝方战术</label>
          <select :value="blueTactic" @change="$emit('update:blueTactic', $event.target.value)">
            <option value="">-- 选择战术 --</option>
            <option v-for="t in tactics" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>
        <div class="tactic-vs">VS</div>
        <div class="tactic-group">
          <label>黄方战术</label>
          <select :value="yellowTactic" :class="{ countered: isYellowCountered }" @change="$emit('update:yellowTactic', $event.target.value)">
            <option value="">-- 选择战术 --</option>
            <option v-for="t in tactics" :key="t" :value="t">{{ t }}</option>
          </select>
          <span v-if="isYellowCountered" class="countered-hint">{{ counterText }}</span>
        </div>
      </div>
      <p class="tactic-rule">克制关系：强击 → 破袭 → 试探 → 扼守 → 强击（箭头左侧克制右侧，被克制方战术失效）</p>
    </section>

    <section class="pre-battle-section">
      <h2>战前修正</h2>
      <div class="pre-battle-row">
        <label>蓝方战前胜补</label>
        <input type="number" :value="bluePreBattleBonus" min="0" class="field-input short" @input="$emit('update:bluePreBattleBonus', Number($event.target.value) || 0)" />
        <label>蓝方战前胜怯</label>
        <input type="number" :value="bluePreBattlePenalty" min="0" class="field-input short" @input="$emit('update:bluePreBattlePenalty', Number($event.target.value) || 0)" />
      </div>
      <div class="pre-battle-row">
        <label>黄方战前胜补</label>
        <input type="number" :value="yellowPreBattleBonus" min="0" class="field-input short" @input="$emit('update:yellowPreBattleBonus', Number($event.target.value) || 0)" />
        <label>黄方战前胜怯</label>
        <input type="number" :value="yellowPreBattlePenalty" min="0" class="field-input short" @input="$emit('update:yellowPreBattlePenalty', Number($event.target.value) || 0)" />
      </div>
    </section>

    <section class="mana-section">
      <h2>魔力消耗</h2>
      <div class="mana-grid">
        <div class="mana-side">
          <h3>蓝方魔力</h3>
          <div v-for="slot in blueSlots" :key="'mana-b-' + slot.key">
            <div v-if="slot.card" class="mana-row">
              <span class="mana-name">{{ slot.card.className || slot.card.code }}</span>
              <label>当前</label>
              <input type="number" v-model.number="manaBlue[slot.key].current" min="0" class="mana-input" />
              <label>消耗</label>
              <input type="number" v-model.number="manaBlue[slot.key].consumption" min="0" class="mana-input" />
              <span class="mana-remaining" :class="{ danger: manaBlue[slot.key].remaining < 0 }">剩余: {{ manaBlue[slot.key].remaining }}</span>
              <span v-if="manaBlue[slot.key].penalty > 0" class="mana-penalty">扣属性: {{ manaBlue[slot.key].penalty }}</span>
            </div>
          </div>
        </div>
        <div class="mana-side">
          <h3>黄方魔力</h3>
          <div v-for="slot in yellowSlots" :key="'mana-y-' + slot.key">
            <div v-if="slot.card || slot.name" class="mana-row">
              <span class="mana-name">{{ getSlotDisplayName(slot) }}</span>
              <label>当前</label>
              <input type="number" v-model.number="manaYellow[slot.key].current" min="0" class="mana-input" />
              <label>消耗</label>
              <input type="number" v-model.number="manaYellow[slot.key].consumption" min="0" class="mana-input" />
              <span class="mana-remaining" :class="{ danger: manaYellow[slot.key].remaining < 0 }">剩余: {{ manaYellow[slot.key].remaining }}</span>
              <span v-if="manaYellow[slot.key].penalty > 0" class="mana-penalty">扣属性: {{ manaYellow[slot.key].penalty }}</span>
            </div>
          </div>
        </div>
      </div>
      <p class="hint">魔力不足惩罚：每缺20魔力扣除10点属性，单独行动时减半</p>
    </section>
  </div>
</template>

<script setup>
defineProps({
  visible: { type: Boolean, default: false },
  tactics: { type: Array, default: () => [] },
  blueTactic: { type: String, default: '' },
  yellowTactic: { type: String, default: '' },
  isYellowCountered: { type: Boolean, default: false },
  counterText: { type: String, default: '' },
  bluePreBattleBonus: { type: Number, default: 0 },
  bluePreBattlePenalty: { type: Number, default: 0 },
  yellowPreBattleBonus: { type: Number, default: 0 },
  yellowPreBattlePenalty: { type: Number, default: 0 },
  blueSlots: { type: Array, default: () => [] },
  yellowSlots: { type: Array, default: () => [] },
  manaBlue: { type: Object, required: true },
  manaYellow: { type: Object, required: true },
  getSlotDisplayName: { type: Function, required: true },
})

defineEmits([
  'update:blueTactic',
  'update:yellowTactic',
  'update:bluePreBattleBonus',
  'update:bluePreBattlePenalty',
  'update:yellowPreBattleBonus',
  'update:yellowPreBattlePenalty',
])
</script>
