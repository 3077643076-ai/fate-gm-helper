<template>
  <!-- 初始工序：选择三项战斗属性，并展示基础胜率计算结果。 -->
  <div v-if="visible" class="phase-stack">
    <section class="settlement-section">
      <h2>战斗属性选择 — 基础胜率</h2>
      <p class="hint">规则时点：初始工序能力结算并展露战斗计算表后，双方主力位选择主要属性，再决定随机属性。</p>
      <div class="compare-config">
        <label>蓝方主力主要属性</label>
        <select :value="compareKey1" class="compare-select" @change="$emit('update:compareKey1', $event.target.value)">
          <option v-for="sk in battleStatKeys" :key="sk.key" :value="sk.key">{{ sk.label }}</option>
        </select>
        <label>黄方主力主要属性</label>
        <select :value="compareKey2" class="compare-select" @change="$emit('update:compareKey2', $event.target.value)">
          <option v-for="sk in battleStatKeys" :key="sk.key" :value="sk.key">{{ sk.label }}</option>
        </select>
        <label>随机属性</label>
        <select :value="compareKey3" class="compare-select" @change="$emit('update:compareKey3', $event.target.value)">
          <option v-for="sk in battleStatKeys" :key="sk.key" :value="sk.key">{{ sk.label }}</option>
        </select>
      </div>

      <table class="compare-table">
        <thead>
          <tr>
            <th>属性</th>
            <th>蓝方值</th>
            <th>优劣</th>
            <th>黄方值</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="cmp in statComparisons" :key="cmp.key">
            <td class="stat-name">{{ getStatLabel(cmp.key) }}</td>
            <td :class="cmp.result === '优' ? 'advantage' : ''">{{ cmp.blueValue }}</td>
            <td>
              <span v-if="cmp.result === '优'" class="tag-you">优 ▲</span>
              <span v-else-if="cmp.result === '劣'" class="tag-lie">劣 ▼</span>
              <span v-else class="tag-ping">平 =</span>
            </td>
            <td :class="cmp.result === '劣' ? 'advantage' : ''">{{ cmp.yellowValue }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td class="stat-name">合计</td>
            <td colspan="3">
              总分: {{ statComparisonSummary.totalScore }}
              ({{ statComparisonSummary.summary }}) →
              <strong class="base-rate">基础胜率: {{ statComparisonSummary.baseWinRate }}%</strong>
            </td>
          </tr>
        </tfoot>
      </table>

      <div class="correction-row">
        <div class="correction-group">
          <label>蓝方对比属性补正（每点+10）</label>
          <input type="number" :value="blueAttrCorrection" class="field-input short" @input="$emit('update:blueAttrCorrection', Number($event.target.value) || 0)" />
        </div>
        <div class="correction-group">
          <label>黄方对比属性补正（每点+10）</label>
          <input type="number" :value="yellowAttrCorrection" class="field-input short" @input="$emit('update:yellowAttrCorrection', Number($event.target.value) || 0)" />
        </div>
      </div>

      <div class="manual-correction-grid">
        <div class="manual-correction-side">
          <h3>蓝方细项补正</h3>
          <div v-for="field in correctionFields" :key="'blue-' + field.key" class="manual-correction-row">
            <label>{{ field.label }}</label>
            <input type="number" v-model.number="manualCorrections.blue[field.key]" class="field-input short" />
          </div>
        </div>
        <div class="manual-correction-side">
          <h3>黄方细项补正</h3>
          <div v-for="field in correctionFields" :key="'yellow-' + field.key" class="manual-correction-row">
            <label>{{ field.label }}</label>
            <input type="number" v-model.number="manualCorrections.yellow[field.key]" class="field-input short" />
          </div>
        </div>
      </div>
      <p class="hint correction-hint">补正一只加到非宝具的对比属性；补正二加到全部对比属性；宝外/全属/上三补惩按 Excel 手动表规则加入属性总值。</p>
    </section>
  </div>
</template>

<script setup>
defineProps({
  visible: { type: Boolean, default: false },
  battleStatKeys: { type: Array, default: () => [] },
  compareKey1: { type: String, required: true },
  compareKey2: { type: String, required: true },
  compareKey3: { type: String, required: true },
  statComparisons: { type: Array, default: () => [] },
  statComparisonSummary: { type: Object, required: true },
  blueAttrCorrection: { type: Number, default: 0 },
  yellowAttrCorrection: { type: Number, default: 0 },
  correctionFields: { type: Array, default: () => [] },
  manualCorrections: { type: Object, required: true },
  getStatLabel: { type: Function, required: true },
})

defineEmits([
  'update:compareKey1',
  'update:compareKey2',
  'update:compareKey3',
  'update:blueAttrCorrection',
  'update:yellowAttrCorrection',
])
</script>
