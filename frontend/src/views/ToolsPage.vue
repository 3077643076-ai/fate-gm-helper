<template>
  <div class="page">
    <div class="page-head">
      <h2>小工具</h2>
      <p>独立小功能集合，随做随挂</p>
    </div>

    <!-- 已实现：技能三件套（页签切换） -->
    <div class="tool-tabs">
      <button
        v-for="tab in readyTabs"
        :key="tab.key"
        class="tool-tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >{{ tab.label }}</button>
    </div>
    <component :is="activeComponent" />

    <!-- 占位区（草图小工具页：AI 车卡 / AI 宝具技能作成 / Q&A 判例 / 未完待续） -->
    <div class="placeholder-grid">
      <div v-for="p in placeholders" :key="p.title" class="placeholder-card">
        <h4>{{ p.title }}</h4>
        <p>{{ p.desc }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
// 小工具 tab：已实现的技能三件套 + 草图里的占位卡（AI 车卡/Q&A 等后续批次）
import { ref, computed } from 'vue'
import SkillTemplateManage from '../components/tools/SkillTemplateManage.vue'
import SkillSubmissionConfirm from '../components/tools/SkillSubmissionConfirm.vue'
import SkillRecord from '../components/tools/SkillRecord.vue'

const readyTabs = [
  { key: 'templates', label: '技能模板库', component: SkillTemplateManage },
  { key: 'submissions', label: '技能提交确认', component: SkillSubmissionConfirm },
  { key: 'records', label: '技能记录', component: SkillRecord },
]
const activeTab = ref('templates')
const activeComponent = computed(() => readyTabs.find(t => t.key === activeTab.value)?.component)

const placeholders = [
  { title: 'AI 车卡', desc: '截图/文本上传 → AI 识别属性技能 → 生成角色卡草稿 → GM 确认入库' },
  { title: 'AI 宝具/技能作成', desc: '输入技能描述 → 按模板格式生成结构化草稿 → GM 审核入库' },
  { title: 'Q&A 判例', desc: '新问题队列、关键词搜索、判例归档' },
  { title: '未完待续', desc: '预留扩展位' },
]
</script>

<style scoped>
.tool-tabs { display: flex; gap: 0.3rem; margin-bottom: 0.8rem; }
.tool-tab {
  border: 1px solid var(--c-line);
  background: var(--c-paper);
  border-radius: var(--radius);
  padding: 0.35rem 1rem;
  font-size: 0.9rem;
  cursor: pointer;
  color: var(--c-ink-2);
}
.tool-tab.active {
  background: var(--c-primary);
  border-color: var(--c-primary);
  color: #fff;
  font-weight: 600;
}

.placeholder-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-top: 1rem;
}
@media (max-width: 900px) { .placeholder-grid { grid-template-columns: 1fr 1fr; } }
.placeholder-card {
  background: var(--c-paper);
  border: 1px dashed var(--c-line-strong);
  border-radius: var(--radius);
  padding: 0.9rem 1rem;
}
.placeholder-card h4 { margin: 0 0 0.3rem; font-size: 0.9rem; color: var(--c-ink-2); }
.placeholder-card p { margin: 0; font-size: 0.8rem; color: var(--c-ink-2); line-height: 1.6; }
</style>
