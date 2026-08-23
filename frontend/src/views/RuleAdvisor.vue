<template>
  <div class="page">
    <div class="page-header">
      <h2>规则判定助手</h2>
      <p class="subtitle">输入判定场景，从规则库检索相关原文，可选让 AI 给出判定建议（仅供 GM 审核，不自动裁决）</p>
    </div>

    <div v-if="notBuilt" class="warn-box">
      知识库索引还没构建。请在 backend-node 目录运行：
      <code>npm run build-kb</code>
      （首次会下载约 100MB 的中文嵌入模型）
    </div>

    <div class="query-box">
      <textarea
        v-model="question"
        placeholder="例：多阵营抢同一灵脉怎么办？ / 特供技能「立于境界A」对即死判定的处理？"
        rows="4"
      />
      <div class="query-actions">
        <button class="btn primary" :disabled="loading || !question.trim()" @click="run('advise')">
          {{ loading ? '处理中…' : '问 AI 判定' }}
        </button>
        <button class="btn" :disabled="loading || !question.trim()" @click="run('search')">
          只看原文
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading">正在检索规则库{{ mode === 'advise' ? '并生成建议' : '' }}…</div>

    <div v-if="mode === 'advise' && !loading" class="result-section">
      <div v-if="answer" class="answer-card">
        <h3>AI 判定建议（仅供参考，请 GM 审核）</h3>
        <div class="answer-text">{{ answer }}</div>
      </div>
      <div v-if="llmSkipped && !answer" class="warn-box">
        <p v-if="llmError">LLM 不可用：{{ llmError }}</p>
        <p v-else>LLM 不可用（未配置 DEEPSEEK_API_KEY）。下方展示检索到的规则原文，可自行判定。</p>
      </div>
    </div>

    <div v-if="results.length && !loading" class="result-section">
      <h3>相关规则原文（{{ results.length }} 条）</h3>
      <div v-for="(r, i) in results" :key="i" class="source-card">
        <div class="source-head">
          <span class="source-file">{{ r.source_file }}</span>
          <span class="source-title">{{ r.title }}</span>
          <span class="source-score">#{{ i + 1 }}</span>
        </div>
        <pre class="source-content">{{ r.content }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { kbStatus, searchKb, adviseKb } from '../services/ruleAdvisor'

const question = ref('')
const loading = ref(false)
const mode = ref('')
const answer = ref('')
const llmSkipped = ref(false)
const llmError = ref('')
const results = ref([])
const notBuilt = ref(false)

async function checkStatus() {
  try {
    const s = await kbStatus()
    notBuilt.value = !s.built
  } catch (e) {
    notBuilt.value = true
  }
}
onMounted(checkStatus)

async function run(m) {
  const q = question.value.trim()
  if (!q || loading.value) return
  loading.value = true
  mode.value = m
  answer.value = ''
  llmSkipped.value = false
  llmError.value = ''
  results.value = []
  try {
    if (m === 'advise') {
      const data = await adviseKb(q)
      answer.value = data.answer || ''
      llmSkipped.value = !!data.llmSkipped
      llmError.value = data.error || ''
      results.value = data.sources || []
    } else {
      const data = await searchKb(q)
      results.value = data.results || []
    }
  } catch (e) {
    llmError.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.page {
  max-width: 900px;
  margin: 0 auto;
  padding: 1.5rem;
}
.page-header h2 {
  margin: 0 0 0.35rem;
}
.subtitle {
  color: var(--color-text-secondary, #666);
  font-size: 0.9rem;
  margin: 0 0 1rem;
}
.warn-box {
  background: #fff8e6;
  border: 1px solid #e6d5a8;
  border-radius: 0.6rem;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  color: #7a5b00;
  font-size: 0.9rem;
}
.warn-box code {
  background: #f3e9cc;
  padding: 0.1rem 0.35rem;
  border-radius: 0.3rem;
}
.query-box {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.query-box textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--color-border, #ccc);
  border-radius: 0.6rem;
  font-size: 1rem;
  resize: vertical;
  font-family: inherit;
}
.query-actions {
  display: flex;
  gap: 0.6rem;
}
.btn {
  padding: 0.55rem 1.2rem;
  border-radius: 0.5rem;
  border: 1px solid var(--color-border, #ccc);
  background: #fff;
  cursor: pointer;
  font-size: 0.95rem;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn.primary {
  background: var(--color-primary, #667eea);
  color: #fff;
  border-color: var(--color-primary, #667eea);
}
.loading {
  margin-top: 1rem;
  color: var(--color-text-secondary, #666);
}
.result-section {
  margin-top: 1.5rem;
}
.answer-card {
  background: linear-gradient(135deg, #f0f2ff, #faf5ff);
  border: 1px solid #d5ccf0;
  border-radius: 0.8rem;
  padding: 1rem 1.25rem;
}
.answer-card h3 {
  margin: 0 0 0.6rem;
  font-size: 1rem;
  color: #5f3dc4;
}
.answer-text {
  white-space: pre-wrap;
  line-height: 1.7;
}
.source-card {
  border: 1px solid var(--color-border, #ddd);
  border-radius: 0.6rem;
  margin-bottom: 0.75rem;
  overflow: hidden;
}
.source-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: #f7f6f2;
  font-size: 0.85rem;
}
.source-file {
  color: #5f3dc4;
  font-weight: 600;
}
.source-title {
  flex: 1;
  color: var(--color-text-secondary, #666);
}
.source-score {
  color: #2e7d32;
  font-weight: 600;
}
.source-content {
  margin: 0;
  padding: 0.75rem;
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 0.88rem;
  line-height: 1.6;
  max-height: 220px;
  overflow-y: auto;
  background: #fff;
}
</style>
