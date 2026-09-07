// lib/search.mjs —— 搜规则：规则书/资源库关键词检索（带出处）
// 定位（SOP 3.2 查证路由）：能力的数值与效果的权威来源。
// v0.1 为简易版：逐文件逐行包含匹配（46 万字本地扫描毫秒级，够用）；
// 二期接入 knowledge 的 FTS5 全文索引与拼音容错（见 NOTES）。
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { resolveConfig } from './store.mjs'

const MAX_HITS_PER_FILE = 8   // 每个文件最多返回的命中数
const MAX_FILES = 30          // 最多扫描的文件数（防目录异常膨胀）
const CONTEXT_LINES = 1       // 命中行前后各带几行上下文

/** 列出知识目录下全部 md 文件的完整路径 */
function listKnowledgeFiles(knowledgeDir) {
  try {
    return readdirSync(knowledgeDir)
      .filter((name) => name.toLowerCase().endsWith('.md'))
      .slice(0, MAX_FILES)
      .map((name) => join(knowledgeDir, name))
  } catch {
    return []
  }
}

/** 在单个文件里按行搜索，返回带出处的命中块 */
function searchInFile(filePath, keyword) {
  const fileName = filePath.split(/[\\/]/).pop()
  let lines
  try {
    lines = readFileSync(filePath, 'utf8').split('\n')
  } catch {
    return []
  }

  const hits = []
  for (let i = 0; i < lines.length && hits.length < MAX_HITS_PER_FILE; i++) {
    if (!lines[i].includes(keyword)) continue
    const from = Math.max(0, i - CONTEXT_LINES)
    const to = Math.min(lines.length, i + CONTEXT_LINES + 1)
    const context = lines
      .slice(from, to)
      .map((line) => (line.length > 120 ? line.slice(0, 120) + '…' : line))
      .join('\n')
    hits.push(`[${fileName}:${i + 1}]\n${context}`)
  }
  return hits
}

/** 主入口：按关键词搜全部知识文件 */
export function searchRule(config = {}, keyword) {
  const kw = String(keyword ?? '').trim()
  if (!kw) return { text: '请提供关键词（技能名/宝具名/规则词）。' }

  const { knowledgeDir } = resolveConfig(config)
  const files = listKnowledgeFiles(knowledgeDir)
  if (files.length === 0) {
    return { text: `知识目录不可用：${knowledgeDir}（确认项目 knowledge/ 目录存在）` }
  }

  const blocks = []
  for (const file of files) {
    blocks.push(...searchInFile(file, kw))
    if (blocks.length >= 24) break // 总量控制，防单次输出过长
  }

  if (blocks.length === 0) {
    return {
      text: [
        `规则资料里没有直接包含"${kw}"的行。`,
        '提示：玩家俗称≠规范名，先试标准名（如"魔境的智慧"而非"魔镜"）；',
        '仍查不到 → 按 SOP 标"需裁决"或确认是否玩家自创技能（自创技能经 GM 确认后录技能模板库）。',
      ].join('\n'),
    }
  }

  return {
    text: [
      `规则资料检索"${kw}"：${blocks.length} 处命中（权威来源，引用请带出处）。`,
      '',
      ...blocks,
      '',
      '提醒：玩家角色卡与规则可能版本不一致或填写有误——数值与效果以这里为准。',
    ].join('\n'),
  }
}

export { resolveConfig }
