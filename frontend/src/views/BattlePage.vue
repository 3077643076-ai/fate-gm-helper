<template>
  <div class="page">
    <div class="page-head">
      <h2>战斗</h2>
      <p>双方战斗表（Excel 复刻版）</p>
    </div>

    <div class="sheet battle-placeholder">
      <h3 class="sheet-title">下一批落地</h3>
      <p class="sheet-note">
        按《00-双方战斗表》草图复刻：①战斗位确定+冲锋 ②属性结算组别明细 ③三属性对抗→基础胜率
        ④组别B→总值 ⑤最终工序胜率链，一张纵向集成大表 + 六步骤进度控制。
      </p>
      <p class="sheet-note">自动计算逻辑（useBattleCalculator / settlementOrder）已就绪，届时直接接入。</p>
    </div>
  </div>
</template>

<script setup>
// 战斗 tab：占位。大表实现时替换本文件内容。
</script>

<style scoped>
.battle-placeholder { padding: 1.4rem; }
</style>
