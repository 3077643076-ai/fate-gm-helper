<script setup>
// 技能速查弹层：一次关键词同时搜「模板库」和「本战役全部角色卡」
// 场景：王财/魔境这类抓取技能的效果，GM 需要快速查到玩家临时获得的技能文本
import { ref } from 'vue'
import { listSkillTemplates } from '../../services/skillTemplate'
import { listCharacterCards } from '../../services/characterCard'
import { normalizeSkillName } from '../../composables/useBattlePhaseBoard'

const props = defineProps({
  open: { type: Boolean, default: false },
  campaignId: { type: Number, default: null },
})

const emit = defineEmits(['close', 'view-skill'])

const keyword = ref('')
const searching = ref(false)
const searched = ref(false)
const message = ref('')
const templateResults = ref([])
const cardSkillResults = ref([])

async function search() {
  const word = keyword.value.trim()
  if (!word) {
    message.value = '请输入技能名或关键词'
    return
  }
  searching.value = true
  message.value = ''
  try {
    // 通道一：模板库（命中时原文和结构化效果最全）
    const templateRes = await listSkillTemplates(0, 20, word)
    templateResults.value = templateRes?.content || []
  } catch (err) {
    templateResults.value = []
    message.value = err.message || '搜索模板库失败'
  }
  try {
    // 通道二：本战役全部角色卡，前端按技能名过滤
    // （卡量通常几十张，一次拉全量足够；后端 keyword 搜的是卡名，不适合搜技能）
    if (props.campaignId) {
      const cardRes = await listCharacterCards(0, 200, null, props.campaignId)
      const cards = cardRes?.content || cardRes || []
      const wordNorm = normalizeSkillName(word)
      const rows = []
      for (const card of cards) {
        const cardName = `${card.className || ''} ${card.code || ''}`.trim()
        const groups = [
          [card.classSkills, '技能'],
          [card.personalSkills, '技能'],
          [card.noblePhantasms, '宝具'],
          [card.workshops, '工房构件'],
          [card.craftEssences, '礼装'],
        ]
        for (const [list, abilityKind] of groups) {
          if (!Array.isArray(list)) continue
          for (const skill of list) {
            const name = skill.name || ''
            if (!name) continue
            if (normalizeSkillName(name).includes(wordNorm)) {
              rows.push({
                key: `${card.id}:${name}`,
                cardName,
                abilityKind,
                name,
                rank: skill.rank || '',
                card,
              })
            }
          }
        }
      }
      cardSkillResults.value = rows
    } else {
      cardSkillResults.value = []
    }
  } catch (err) {
    cardSkillResults.value = []
    if (!message.value) message.value = err.message || '搜索角色卡失败'
  } finally {
    searching.value = false
    searched.value = true
  }
}

// 点击结果 → 交给父页面打开原文弹层
function viewTemplate(template) {
  emit('view-skill', {
    skillName: template.name,
    originalRank: template.rank || '',
    abilityKind: template.skillType === '宝具' ? '宝具' : '技能',
    skillType: template.skillType || '',
    npType: template.npType || '',
    template,
  })
}

function viewCardSkill(row) {
  emit('view-skill', {
    skillName: row.name,
    originalRank: row.rank,
    characterName: row.cardName,
    abilityKind: row.abilityKind,
    cardRawText: row.card.rawText || '',
    template: null,
  })
}

function close() {
  emit('close')
}
</script>

<template>
  <teleport to="body">
    <div v-if="open" class="modal-mask" @click.self="close">
      <article class="modal-card">
        <header class="modal-header">
          <div>
            <h3>技能速查</h3>
            <p class="meta">同时搜索技能模板库和本战役全部角色卡</p>
          </div>
          <button type="button" class="close-btn" @click="close">关闭</button>
        </header>

        <div class="search-row">
          <input
            v-model="keyword"
            placeholder="例如：王财抓到的技能名、或任意关键词"
            @keyup.enter="search"
          />
          <button type="button" class="search-btn" :disabled="searching" @click="search">
            {{ searching ? '搜索中...' : '搜索' }}
          </button>
        </div>

        <p v-if="message" class="message">{{ message }}</p>

        <template v-if="searched && !searching">
          <section class="result-section">
            <h4>模板库（{{ templateResults.length }}）</h4>
            <div v-if="templateResults.length === 0" class="empty">模板库没有匹配项。</div>
            <div v-for="template in templateResults" :key="template.id" class="result-row">
              <button type="button" class="result-btn" @click="viewTemplate(template)">
                <strong>{{ template.name }}</strong>
                <span class="result-meta">
                  <span v-if="template.rank">{{ template.rank }}</span>
                  <span v-if="template.skillType">{{ template.skillType }}{{ template.npType ? `·${template.npType}` : '' }}</span>
                  <span v-if="template.timing">{{ template.timing }}</span>
                </span>
                <small v-if="template.rawText">{{ template.rawText.slice(0, 60) }}{{ template.rawText.length > 60 ? '...' : '' }}</small>
              </button>
            </div>
          </section>

          <section class="result-section">
            <h4>角色卡（{{ cardSkillResults.length }}）</h4>
            <div v-if="cardSkillResults.length === 0" class="empty">本战役角色卡里没有匹配的技能名。</div>
            <div v-for="row in cardSkillResults" :key="row.key" class="result-row">
              <button type="button" class="result-btn" @click="viewCardSkill(row)">
                <strong>{{ row.name }}</strong>
                <span class="result-meta">
                  <span>{{ row.cardName }}</span>
                  <span>{{ row.abilityKind }}</span>
                  <span v-if="row.rank">{{ row.rank }}</span>
                </span>
              </button>
            </div>
          </section>
        </template>
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
  width: min(680px, 100%);
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

.search-row {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.9rem;
}

.search-row input {
  flex: 1;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0.55rem 0.75rem;
  font-size: 0.9rem;
}

.search-btn {
  border: none;
  border-radius: 999px;
  padding: 0.55rem 1rem;
  background: var(--color-primary);
  color: #fff;
  cursor: pointer;
  font-weight: 600;
}

.search-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.message {
  margin: 0.7rem 0 0;
  padding: 0.55rem 0.75rem;
  border-radius: 10px;
  background: #fff7e3;
  color: var(--color-accent);
  font-size: 0.84rem;
}

.result-section {
  margin-top: 0.9rem;
}

.result-section h4 {
  margin: 0 0 0.4rem;
  color: var(--color-text-secondary);
  font-size: 0.82rem;
  font-weight: 600;
}

.empty {
  padding: 0.5rem 0;
  color: var(--color-text-secondary);
  font-size: 0.84rem;
}

.result-row + .result-row {
  margin-top: 0.35rem;
}

.result-btn {
  display: grid;
  gap: 0.2rem;
  width: 100%;
  text-align: left;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0.55rem 0.7rem;
  background: #fff;
  cursor: pointer;
}

.result-btn:hover {
  border-color: var(--color-primary);
  background: #f6f8fc;
}

.result-btn strong {
  color: var(--color-primary-dark);
  font-size: 0.9rem;
}

.result-meta {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  color: var(--color-text-secondary);
  font-size: 0.78rem;
}

.result-btn small {
  color: var(--color-text-secondary);
  font-size: 0.78rem;
}
</style>
