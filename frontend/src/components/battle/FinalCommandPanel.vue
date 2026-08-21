<template>
  <!-- 最终工序：目前只处理死斗指令，后续可继续加撤退/响应。 -->
  <div v-if="visible" class="phase-stack">
    <section class="settlement-section">
      <h2>最终工序指令</h2>
      <p class="hint">规则时点：最终工序确认战斗计算表后，双方选择是否提交死斗指令；死斗给予自身 +20% 胜率补正，并且无法在最终工序撤退。</p>
      <div class="deathmatch-row">
        <label>
          <input type="checkbox" :checked="blueDeathmatch" @change="$emit('update:blueDeathmatch', $event.target.checked)" />
          蓝方主力提交死斗（+20%）
        </label>
        <label>
          <input type="checkbox" :checked="yellowDeathmatch" @change="$emit('update:yellowDeathmatch', $event.target.checked)" />
          黄方主力提交死斗（+20%）
        </label>
      </div>
    </section>
  </div>
</template>

<script setup>
defineProps({
  visible: { type: Boolean, default: false },
  blueDeathmatch: { type: Boolean, default: false },
  yellowDeathmatch: { type: Boolean, default: false },
})

defineEmits(['update:blueDeathmatch', 'update:yellowDeathmatch'])
</script>
