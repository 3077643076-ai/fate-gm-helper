<template>
  <div>
    <div class="page-head">
      <h2>魔力结算 · 变动明细 + 剩余魔力</h2>
      <p>当前回合各单位的魔力账面（详细流水台账由引擎记账，后续批次接入）</p>
    </div>

    <div class="sheet">
      <h3 class="sheet-title">当前回合魔力账面（第 {{ roundLabel }} 回合）</h3>
      <table v-if="rows.length" class="sheet-table">
        <thead>
          <tr><th>单位</th><th>职别</th><th>剩余魔力</th><th>上限</th><th>状态效果</th><th>备注</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.cardId">
            <td>{{ r.name }}</td>
            <td>{{ r.role }}</td>
            <td class="num cell-auto">{{ r.mana ?? '—' }}</td>
            <td class="num">{{ r.limit ?? '—' }}</td>
            <td>{{ r.effects || '—' }}</td>
            <td>{{ r.notes || '—' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-tip">
        本回合还没有登记角色状态。战斗表结算确认后会自动回写魔力；也可由 GM 在战斗表或后续功能里登记。
      </p>
    </div>

    <div class="sheet">
      <h3 class="sheet-title">魔力变动流水</h3>
      <p class="empty-tip">
        逐笔流水（来源：回路/灵脉/圣杯/魂食/宝具/转让）需要引擎记账接口支撑，属于后续批次。
        当前口径以《结算记录》文档为准，数量核对走轮次结算页的对账。
      </p>
    </div>
  </div>
</template>

<script setup>
// 魔力结算页：按当前回合展示各单位魔力账面（character_status 表）
import { ref, computed, watch } from 'vue'
import { useCurrentCampaign } from '../../composables/useCurrentCampaign'
import { getCurrentRound } from '../../services/round'
import { getCharacterStatusesByCampaignAndRound } from '../../services/characterStatus'
import { listCharacterCards } from '../../services/characterCard'

const { current } = useCurrentCampaign()
const campaignId = computed(() => current.value?.id)

const roundLabel = ref('—')
const rows = ref([])

// 状态效果列表安全解析
function effectText(v) {
  if (!v) return ''
  try {
    const arr = JSON.parse(v)
    if (!Array.isArray(arr)) return ''
    return arr.map(e => `${e.name || '?'}${e.level ? `×${e.level}` : ''}`).join('、')
  } catch {
    return ''
  }
}

async function refresh() {
  if (!campaignId.value) { rows.value = []; return }
  let round = null
  try {
    round = await getCurrentRound(campaignId.value)
    roundLabel.value = round?.turn_number ?? '—'
  } catch { /* 无回合时保持默认 */ }
  if (!round) { rows.value = []; return }

  try {
    const [statuses, cards] = await Promise.all([
      getCharacterStatusesByCampaignAndRound(campaignId.value, round.turn_number),
      listCharacterCards(0, 100, null, campaignId.value),
    ])
    const cardMap = new Map((Array.isArray(cards) ? cards : []).map(c => [c.id, c]))
    rows.value = (statuses || []).map(s => {
      const card = cardMap.get(s.characterCardId ?? s.character_card_id)
      return {
        cardId: s.characterCardId ?? s.character_card_id,
        name: card ? (card.code || card.class_name) : `卡#${s.characterCardId ?? s.character_card_id}`,
        role: card?.card_type === 'MASTER' ? '御主' : '从者',
        mana: s.currentMana ?? s.current_mana,
        limit: s.manaLimit ?? s.mana_limit,
        effects: effectText(s.statusEffectsList ?? s.status_effects_list),
        notes: s.notes || '',
      }
    })
  } catch {
    rows.value = []
  }
}

watch(campaignId, refresh, { immediate: true })
</script>
