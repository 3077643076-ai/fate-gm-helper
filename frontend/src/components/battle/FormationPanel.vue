<template>
  <!-- 编队与属性：只负责选择角色/临时属性和展示双方总属性。 -->
  <section v-show="visible" class="phase-card">
    <header class="phase-card-header">
      <div>
        <h2>编队与属性</h2>
        <p class="hint">选择双方参战从者；临时或未录入角色可切到手动属性。辅助位自动按一半计入总值。</p>
      </div>
      <div class="formation-actions">
        <label class="battlefield-width-control">
          <span>战场宽度</span>
          <input type="number" :value="battlefieldWidth" min="0" class="field-input" @input="$emit('update:battlefieldWidth', Number($event.target.value) || 0)" />
        </label>
        <button type="button" class="btn-confirm-phase" @click="$emit('confirm-phase')" :disabled="settlementConfirmed || isConfirmed">
          {{ isConfirmed ? '编队已确认' : '确认编队' }}
        </button>
        <button type="button" class="btn-phase-reopen" @click="$emit('reopen-phase')" :disabled="settlementConfirmed || !isConfirmed">
          撤回确认
        </button>
      </div>
    </header>

    <div class="formations">
      <div class="side blue-side">
        <h2>蓝方</h2>
        <div v-for="pos in blueSlots" :key="pos.key" class="position-row">
          <span class="pos-label">{{ pos.label }}</span>
          <select v-model="pos.cardId" @change="$emit('blue-selection-changed')" class="pos-select">
            <option :value="null">-- 未选择 --</option>
            <option v-for="card in servantCards" :key="card.id" :value="card.id" :disabled="isCardUsed(blueSlots, pos.key, card.id)">
              {{ card.className }} — {{ card.code }}
            </option>
          </select>
          <span v-if="pos.card" class="pos-card-name">{{ getSlotDisplayName(pos) }}</span>
        </div>
      </div>

      <div class="side yellow-side">
        <h2>黄方</h2>
        <div v-for="pos in yellowSlots" :key="pos.key" class="position-row">
          <span class="pos-label">{{ pos.label }}</span>

          <template v-if="pos.mode === 'card'">
            <select v-model="pos.cardId" @change="$emit('yellow-selection-changed')" class="pos-select">
              <option :value="null">-- 未选择 --</option>
              <option v-for="card in servantCards" :key="card.id" :value="card.id" :disabled="isCardUsed(yellowSlots, pos.key, card.id)">
                {{ card.className }} — {{ card.code }}
              </option>
            </select>
            <button type="button" class="btn-mode-switch" @click="$emit('set-yellow-slot-mode', pos, 'manual')">临时手动</button>
            <span v-if="pos.card" class="pos-card-name">{{ getSlotDisplayName(pos) }}</span>
          </template>

          <template v-else>
            <input v-model="pos.name" type="text" class="name-input" placeholder="输入名称" />
            <button type="button" class="btn-edit-stats" @click="$emit('toggle-stat-editor', pos.key)">
              {{ pos.showStats ? '收起' : '属性' }}
            </button>
            <button type="button" class="btn-mode-switch" @click="$emit('set-yellow-slot-mode', pos, 'card')">选卡</button>
            <p class="manual-mode-hint">临时手动不会带入技能/宝具；正式敌人建议先建角色卡。</p>
            <div v-if="pos.showStats" class="stat-editor">
              <div v-for="stat in statKeys" :key="stat.key" class="stat-cell">
                <label>{{ stat.label }}</label>
                <input type="number" v-model.number="pos.stats[stat.key]" min="0" class="stat-input" />
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <section class="stat-table-section">
      <h2>属性对比表</h2>
      <p class="hint">辅助位属性自动减半，总值 = 主力 + 辅助1/2 + 辅助2/2 + ...</p>
      <div class="stat-table-wrap">
        <table class="stat-table">
          <thead>
            <tr>
              <th>属性</th>
              <th v-for="bp in blueSlots" :key="'bh-' + bp.key">{{ bp.label }}(蓝)</th>
              <th class="total-col">蓝总值</th>
              <th v-for="yp in yellowSlots" :key="'yh-' + yp.key">{{ yp.label }}(黄)</th>
              <th class="total-col">黄总值</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="stat in statKeys" :key="stat.key">
              <td class="stat-name">{{ stat.label }}</td>
              <td v-for="bp in blueSlots" :key="'bb-' + bp.key">{{ formatStatValue(getBlueStat(bp, stat.key), bp.isMain) }}</td>
              <td class="total-col" :class="getTotalClass(stat.key, 'blue')">{{ blueTotals[stat.key] }}</td>
              <td v-for="yp in yellowSlots" :key="'yb-' + yp.key">{{ formatStatValue(getYellowStat(yp, stat.key), yp.isMain) }}</td>
              <td class="total-col" :class="getTotalClass(stat.key, 'yellow')">{{ yellowTotals[stat.key] }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="formationWarnings.length" class="formation-warning-panel">
      <h3>编队提醒</h3>
      <ul>
        <li v-for="line in formationWarnings" :key="line">{{ line }}</li>
      </ul>
    </section>
  </section>
</template>

<script setup>
defineProps({
  visible: { type: Boolean, default: false },
  battlefieldWidth: { type: Number, default: 0 },
  blueSlots: { type: Array, default: () => [] },
  yellowSlots: { type: Array, default: () => [] },
  servantCards: { type: Array, default: () => [] },
  statKeys: { type: Array, default: () => [] },
  blueTotals: { type: Object, required: true },
  yellowTotals: { type: Object, required: true },
  formationWarnings: { type: Array, default: () => [] },
  isCardUsed: { type: Function, required: true },
  getSlotDisplayName: { type: Function, required: true },
  getBlueStat: { type: Function, required: true },
  getYellowStat: { type: Function, required: true },
  formatStatValue: { type: Function, required: true },
  getTotalClass: { type: Function, required: true },
})

defineEmits([
  'update:battlefieldWidth',
  'confirm-phase',
  'blue-selection-changed',
  'yellow-selection-changed',
  'set-yellow-slot-mode',
  'toggle-stat-editor',
])
</script>
