<template>
  <!-- 触发按钮：固定右上角 -->
  <button class="qs-trigger" @click="open = !open">速查</button>

  <!-- 浮窗：搜索技能名 / 规则关键词，三路结果分组 -->
  <div v-if="open" class="qs-panel">
    <div class="qs-head">
      <input
        ref="inputRef"
        v-model="keyword"
        class="input qs-input"
        placeholder="搜索：技能名 / 规则关键词"
        @keydown.esc="open = false"
      />
      <button class="btn small" @click="open = false">关闭</button>
    </div>

    <div v-if="loading" class="qs-loading">搜索中…</div>

    <div v-else-if="!keyword.trim()" class="qs-empty">
      输入关键词，同时搜索：模板库 / 本战役角色卡 / 灵脉 / 历史行动 / 规则原文
    </div>

    <div v-else class="qs-body">
      <!-- 模板库 -->
      <section class="qs-group">
        <h4>模板库 <span class="qs-count">{{ templates.length }}</span></h4>
        <template v-if="templates.length">
          <details v-for="t in templates" :key="'t' + t.id" class="qs-item">
            <summary>{{ t.name }}<small v-if="t.rank"> · {{ t.rank }}</small></summary>
            <pre class="qs-raw">{{ t.rawText || t.raw_text || '（无原文）' }}</pre>
          </details>
        </template>
        <p v-else class="qs-none">无匹配</p>
      </section>

      <!-- 本战役角色卡 -->
      <section class="qs-group">
        <h4>本战役角色卡 <span class="qs-count">{{ cards.length }}</span></h4>
        <template v-if="cards.length">
          <details v-for="c in cards" :key="'c' + c.id" class="qs-item">
            <summary>{{ c.code || c.class_name || ('卡#' + c.id) }}<small> · {{ c.card_type === 'MASTER' ? '御主' : '从者' }}</small></summary>
            <pre class="qs-raw">{{ c.raw_text || c.rawText || '（无原文）' }}</pre>
          </details>
        </template>
        <p v-else class="qs-none">无匹配（速查只搜当前选中战役）</p>
      </section>

      <!-- 灵脉 -->
      <section class="qs-group">
        <h4>灵脉 <span class="qs-count">{{ leylines.length }}</span></h4>
        <template v-if="leylines.length">
          <details v-for="l in leylines" :key="'l' + l.id" class="qs-item">
            <summary>{{ l.name }}<small> · 人流{{ l.population_flow }} · 魔{{ l.mana_amount }}</small></summary>
            <pre class="qs-raw">{{ l.effect || '（未录效果）' }}</pre>
          </details>
        </template>
        <p v-else class="qs-none">无匹配</p>
      </section>

      <!-- 历史行动 -->
      <section class="qs-group">
        <h4>历史行动 <span class="qs-count">{{ historyHits.length }}</span></h4>
        <template v-if="historyHits.length">
          <div v-for="(h, i) in historyHits" :key="'h' + i" class="qs-item qs-plain">
            <span class="qs-history-line">
              <b>第{{ h.roundNumber }}回合</b> {{ h.actor }}：{{ h.content }}
            </span>
          </div>
        </template>
        <p v-else class="qs-none">无匹配</p>
      </section>

      <!-- 规则原文 / 判例 -->
      <section class="qs-group">
        <h4>规则原文 <span class="qs-count">{{ kbHits.length }}</span></h4>
        <template v-if="kbHits.length">
          <details v-for="(k, i) in kbHits" :key="'k' + i" class="qs-item">
            <summary>{{ k.title }}</summary>
            <pre class="qs-raw">{{ k.content }}</pre>
          </details>
        </template>
        <p v-else-if="kbUnavailable" class="qs-none">知识库未构建：在 backend-node 运行 npm run build-kb 后可用</p>
        <p v-else class="qs-none">无匹配</p>
      </section>
    </div>
  </div>
</template>

<script setup>
// 速查浮窗（草图：右上角"速查"）：一次关键词同时搜五个来源，纯查看不改数据
// 来源：模板库 / 本战役角色卡 / 灵脉 / 历史行动（均限当前战役）/ 规则原文（知识库）
import { ref, watch, nextTick } from 'vue'
import { listSkillTemplates } from '../services/skillTemplate'
import { listCharacterCards } from '../services/characterCard'
import { listLeylines } from '../services/leyline'
import { listRoundHistory } from '../services/round'
import { searchKb } from '../services/ruleAdvisor'
import { useCurrentCampaign } from '../composables/useCurrentCampaign'

const { current } = useCurrentCampaign()

const open = ref(false)
const keyword = ref('')
const loading = ref(false)
const templates = ref([])
const cards = ref([])
const leylines = ref([])
const historyHits = ref([])
const kbHits = ref([])
const kbUnavailable = ref(false)
const inputRef = ref(null)

let searchTimer = null

watch(open, async (v) => {
  if (v) await nextTick(() => inputRef.value?.focus())
})

// 关键词变化：防抖 300ms 后五路并发搜索
watch(keyword, (kw) => {
  clearTimeout(searchTimer)
  const q = kw.trim()
  if (!q) {
    templates.value = []
    cards.value = []
    leylines.value = []
    historyHits.value = []
    kbHits.value = []
    return
  }
  searchTimer = setTimeout(() => runSearch(q), 300)
})

async function runSearch(q) {
  loading.value = true
  kbUnavailable.value = false
  try {
    const [tpl, card, ley, hist, kb] = await Promise.all([
      listSkillTemplates(0, 20, q).catch(() => null),
      listCharacterCards(0, 10, q, current.value?.id).catch(() => null),
      listLeylines(current.value?.id).catch(() => null),
      listRoundHistory(current.value?.id).catch(() => null),
      searchKb(q).catch(() => null),
    ])
    templates.value = Array.isArray(tpl) ? tpl : (tpl?.items || [])
    cards.value = Array.isArray(card) ? card : (card?.items || [])
    // 灵脉：按名字或效果文字过滤
    const allLey = Array.isArray(ley) ? ley : (ley?.items || [])
    leylines.value = allLey.filter(l =>
      String(l.name || '').includes(q) || String(l.effect || '').includes(q)
    )
    // 历史行动：快照里的行动明细展开成扁平列表再过滤
    const rounds = Array.isArray(hist) ? hist : []
    const flat = []
    for (const r of rounds) {
      for (const key of ['servantActions', 'masterActions']) {
        for (const a of (Array.isArray(r[key]) ? r[key] : [])) {
          flat.push({
            roundNumber: r.roundNumber,
            actor: a.servantClass || a.servant_class || '—',
            content: a.content || '',
          })
        }
      }
    }
    historyHits.value = flat.filter(a => a.content.includes(q) || a.actor.includes(q)).slice(0, 20)
    if (kb) {
      kbHits.value = kb.results || []
    } else {
      kbHits.value = []
      kbUnavailable.value = true
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.qs-trigger {
  position: fixed;
  top: 10px;
  right: 16px;
  z-index: 60;
  border: 1px solid rgba(255, 255, 255, 0.45);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  border-radius: var(--radius);
  padding: 0.2rem 0.8rem;
  font-size: 0.85rem;
  cursor: pointer;
}
.qs-trigger:hover { background: rgba(255, 255, 255, 0.22); }

.qs-panel {
  position: fixed;
  top: 46px;
  right: 16px;
  z-index: 60;
  width: min(420px, calc(100vw - 32px));
  max-height: min(70vh, 640px);
  display: flex;
  flex-direction: column;
  background: var(--c-paper);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--radius);
  box-shadow: 0 6px 24px rgba(20, 30, 50, 0.18);
}
.qs-head { display: flex; gap: 0.5rem; padding: 0.6rem; border-bottom: 1px solid var(--c-line); }
.qs-input { flex: 1; }
.qs-loading, .qs-empty { padding: 1rem; font-size: 0.86rem; color: var(--c-ink-2); }

.qs-body { overflow-y: auto; padding: 0.4rem 0.6rem 0.8rem; }
.qs-group h4 {
  margin: 0.6rem 0 0.3rem;
  font-size: 0.82rem;
  color: var(--c-primary);
}
.qs-count { color: var(--c-ink-2); font-weight: 400; }
.qs-item {
  border: 1px solid var(--c-line);
  border-radius: var(--radius);
  margin-bottom: 0.35rem;
  font-size: 0.86rem;
}
.qs-item summary {
  cursor: pointer;
  padding: 0.35rem 0.55rem;
  user-select: none;
}
.qs-item summary small { color: var(--c-ink-2); }
.qs-raw {
  margin: 0;
  padding: 0.45rem 0.6rem;
  border-top: 1px dashed var(--c-line);
  font-size: 0.8rem;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 240px;
  overflow-y: auto;
  color: var(--c-ink);
}
.qs-none { margin: 0.15rem 0 0.3rem; padding-left: 0.4rem; font-size: 0.82rem; color: var(--c-ink-2); }

/* 历史行动的纯文本行（不用折叠框） */
.qs-plain { padding: 0.35rem 0.55rem; }
.qs-history-line { font-size: 0.82rem; line-height: 1.6; word-break: break-word; }
.qs-history-line b { color: var(--c-primary); }
</style>
