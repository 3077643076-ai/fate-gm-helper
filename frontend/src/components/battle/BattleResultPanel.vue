<template>
  <!-- 决胜结算：展示最终胜率链条，并负责触发结算确认。 -->
  <section v-show="visible" class="phase-card">
    <header class="phase-card-header">
      <div>
        <h2>决胜结算</h2>
        <p class="hint">确认最终胜率无误后，再执行结算回写并锁定本回合战斗表。</p>
      </div>
      <button class="btn-confirm result-confirm" @click="$emit('confirm')" :disabled="saving || confirming || settlementConfirmed">
        {{ settlementConfirmed ? '已确认结算' : confirming ? '回写中...' : '确认结算并回写状态' }}
      </button>
    </header>

    <section class="winrate-section">
      <h2>最终胜率计算</h2>
      <div class="winrate-grid">
        <div class="winrate-col">
          <h3>计算步骤</h3>
          <table class="winrate-table">
            <thead>
              <tr><th>步骤</th><th>蓝方</th><th>黄方</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>基础胜率</td>
                <td>{{ winRateChain.baseWinRate }}%</td>
                <td>{{ 100 - winRateChain.baseWinRate }}%</td>
              </tr>
              <tr>
                <td>主力等级差</td>
                <td :class="winRateChain.levelDiff >= 0 ? 'advantage' : 'disadvantage'">
                  {{ signed(winRateChain.levelDiff) }}
                </td>
                <td :class="winRateChain.levelDiff <= 0 ? 'advantage' : 'disadvantage'">
                  {{ signed(-winRateChain.levelDiff) }}
                </td>
              </tr>
              <tr>
                <td>战斗属性差</td>
                <td :class="winRateChain.attrDiff >= 0 ? 'advantage' : 'disadvantage'">
                  {{ signed(winRateChain.attrDiff) }}
                </td>
                <td :class="winRateChain.attrDiff <= 0 ? 'advantage' : 'disadvantage'">
                  {{ signed(-winRateChain.attrDiff) }}
                </td>
              </tr>
              <tr>
                <td>战前胜率</td>
                <td>{{ winRateChain.bluePreBattle }}</td>
                <td>{{ winRateChain.yellowPreBattle }}</td>
              </tr>
              <tr><td>初始胜率</td><td>{{ winRateChain.blueInitial }}</td><td>{{ winRateChain.yellowInitial }}</td></tr>
              <tr><td>主要胜率</td><td>{{ winRateChain.blueMain }}</td><td>{{ winRateChain.yellowMain }}</td></tr>
              <tr class="divider-row">
                <td>双方胜率(K)</td>
                <td :class="winRateChain.blueK >= 0 ? 'advantage' : 'disadvantage'">{{ winRateChain.blueK }}</td>
                <td :class="winRateChain.yellowK >= 0 ? 'advantage' : 'disadvantage'">{{ winRateChain.yellowK }}</td>
              </tr>
              <tr>
                <td>差值减半</td>
                <td colspan="2" class="halved-cell">{{ winRateChain.halved }}%（蓝方）</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="winrate-col">
          <h3>保底设置</h3>
          <div class="guarantee-row">
            <label>蓝方保底</label>
            <input type="number" :value="blueGuarantee" min="0" max="100" class="field-input short" @input="$emit('update:blueGuarantee', Number($event.target.value) || 0)" /> %
          </div>
          <div class="guarantee-row">
            <label>黄方保底</label>
            <input type="number" :value="yellowGuarantee" min="0" max="100" class="field-input short" @input="$emit('update:yellowGuarantee', Number($event.target.value) || 0)" /> %
          </div>
          <div class="final-result">
            <div class="final-blue" :class="winRateChain.blueFinal >= 50 ? 'win' : 'lose'">
              蓝方最终胜率<br />
              <span class="final-num">{{ winRateChain.blueFinal }}%</span>
            </div>
            <div class="final-vs">VS</div>
            <div class="final-yellow" :class="winRateChain.yellowFinal >= 50 ? 'win' : 'lose'">
              黄方最终胜率<br />
              <span class="final-num">{{ winRateChain.yellowFinal }}%</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </section>
</template>

<script setup>
defineProps({
  visible: { type: Boolean, default: false },
  winRateChain: { type: Object, required: true },
  blueGuarantee: { type: Number, default: 0 },
  yellowGuarantee: { type: Number, default: 0 },
  saving: { type: Boolean, default: false },
  confirming: { type: Boolean, default: false },
  settlementConfirmed: { type: Boolean, default: false },
})

defineEmits(['confirm', 'update:blueGuarantee', 'update:yellowGuarantee'])

function signed(value) {
  const n = Number(value) || 0
  return `${n >= 0 ? '+' : ''}${n}`
}
</script>
