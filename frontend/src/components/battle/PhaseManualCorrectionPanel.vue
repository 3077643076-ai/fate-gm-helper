<template>
  <!-- GM 手动修正：这里的数字会参与后续胜率链条。 -->
  <section v-if="corrections" class="phase-manual-panel">
    <h3>本工序 GM 手动修正记录</h3>
    <div class="phase-manual-grid">
      <div class="phase-manual-side">
        <h4>蓝方</h4>
        <label>胜率修正 <input type="number" v-model.number="corrections.blue.winRate" class="field-input short" /></label>
        <label>保底修正 <input type="number" v-model.number="corrections.blue.guarantee" class="field-input short" /></label>
        <label>备注 <textarea v-model="corrections.blue.note" placeholder="GM 手动裁决说明" /></label>
      </div>
      <div class="phase-manual-side">
        <h4>黄方</h4>
        <label>胜率修正 <input type="number" v-model.number="corrections.yellow.winRate" class="field-input short" /></label>
        <label>保底修正 <input type="number" v-model.number="corrections.yellow.guarantee" class="field-input short" /></label>
        <label>备注 <textarea v-model="corrections.yellow.note" placeholder="GM 手动裁决说明" /></label>
      </div>
    </div>
  </section>
</template>

<script setup>
defineProps({
  corrections: { type: Object, default: null },
})
</script>
