// LLM 语义解析兜底：规则解析失败的公告片段 → LLM 结构化 → 白名单校验
// 模型配置（优先级）：环境变量 > backend-node/data/llm.key 文件（deepseek-chat，与 kb 同 key）
// 输出经白名单校验后才可信；校验不过的照旧进需裁决
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function getKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY
  const f = join(root, 'backend-node', 'data', 'deepseek.key')
  if (existsSync(f)) return readFileSync(f, 'utf8').trim()
  return null
}

/**
 * 离线丰富：把规则解析失败的公告片段批量交给 LLM，产出"别名建议"（人确认后入库）
 * @returns {object} { ok, suggestions: [{alias, verb, target, note}], error }
 */
export async function suggestAliases(fragments, context = {}) {
  const apiKey = getKey()
  if (!apiKey) return { ok: false, suggestions: [], error: '未配置 DEEPSEEK_API_KEY' }
  const verbs = context.verbs ?? []
  const systemPrompt = [
    '你是跑团规则助教。下面是若干条玩家公告片段，它们无法被关键词解析器识别。',
    `可用行动动词（建议的 verb 必须从中选择）：${verbs.join('、')}`,
    '为每个片段给出"别名建议"：玩家口中的说法 → 标准动词+目标。',
    '输出严格 JSON：{"suggestions":[{"alias":"玩家说法","verb":"标准动词","target":"目标或null","note":"一句备注"}]}',
    '无法判断的片段输出 {"suggestions":[]}，不要硬编。',
  ].join('\n')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  try {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: fragments.map((f, i) => `${i + 1}. ${f}`).join('\n') },
        ],
      }),
    })
    if (!resp.ok) return { ok: false, suggestions: [], error: `DeepSeek ${resp.status}` }
    const body = await resp.json()
    const content = body?.choices?.[0]?.message?.content ?? ''
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { ok: false, suggestions: [], error: 'LLM 输出无 JSON' }
    const parsed = JSON.parse(jsonMatch[0])
    const suggestions = (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
      .filter(s => s.alias && verbs.includes(String(s.verb ?? '').trim()))
      .map(s => ({ alias: String(s.alias), verb: String(s.verb).trim(), target: s.target ?? null, note: s.note ?? '' }))
    return { ok: true, suggestions }
  } catch (e) {
    return { ok: false, suggestions: [], error: e.message }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 用 LLM 把一段模糊公告解析成结构化行动（实时兜底，默认关闭；离线丰富走 suggestAliases）
 * @returns {object} { ok, actions: [{verb, target, note}], llmUsed, unparsed, error }
 */
export async function parseWithLLM(fragment, context = {}) {
  const apiKey = getKey()
  if (!apiKey) return { ok: false, llmUsed: false, error: '未配置 DEEPSEEK_API_KEY（data/deepseek.key 或环境变量），LLM 解析跳过' }

  const verbs = context.verbs ?? []
  const leylines = context.leylines ?? []
  const systemPrompt = [
    '你是跑团行动解析器。把玩家公告片段转成结构化行动 JSON。',
    `可用行动动词（必须从中选择）：${verbs.join('、')}`,
    `可用灵脉名（目标若为灵脉必须从中选择）：${leylines.join('、')}`,
    '输出严格 JSON（不要 markdown）格式：',
    '{"actions":[{"verb":"动词","target":"目标或null","note":"一句备注"}]}',
    '规则：一个公告片段可能包含多个行动（按时序拆开）；动词必须来自白名单；',
    '看不出对应行动的片段不要硬编，输出 {"actions":[],"unparsed":"片段原文"}',
  ].join('\n')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 45000)
  try {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `玩家公告片段：${fragment}\n上下文：单位=${context.unitKey ?? '?'}，时段=第${context.round ?? '?'}天${context.phase ?? ''}` },
        ],
      }),
    })
    if (!resp.ok) return { ok: false, llmUsed: true, error: `DeepSeek ${resp.status}` }
    const body = await resp.json()
    const content = body?.choices?.[0]?.message?.content ?? ''
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { ok: false, llmUsed: true, error: 'LLM 输出无 JSON' }
    const parsed = JSON.parse(jsonMatch[0])
    if (parsed.unparsed) return { ok: false, llmUsed: true, unparsed: parsed.unparsed, actions: [] }
    const actions = Array.isArray(parsed.actions) ? parsed.actions : []
    return { ok: true, llmUsed: true, actions }
  } catch (e) {
    return { ok: false, llmUsed: true, error: e.message }
  } finally {
    clearTimeout(timer)
  }
}