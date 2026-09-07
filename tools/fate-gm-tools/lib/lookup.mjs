// lib/lookup.mjs —— 查卡：输出能力名清单 + 卡面原文
// 定位（SOP 3.2 查证路由）：角色卡只回答"这个单位有什么能力"（名字来源）；
// 数值与效果由 gm_search_rule 按规则书核对。
import { openDb, resolveConfig } from './store.mjs'

/** 从 JSON 文本字段里安全解析出数组（坏数据回退为空数组） */
function parseJsonArray(text) {
  try {
    const value = JSON.parse(text ?? '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

/** 把一条卡记录转成 AI 可读的文本（能力名清单 + 截断的卡面原文） */
function formatCard(row, rawLimit = 1200) {
  // 能力名字清单：从各 JSON 字段抽名字（兼容对象/字符串两种存储形态）
  const namesOf = (rows) =>
    parseJsonArray(rows)
      .map((item) => (typeof item === 'string' ? item : item?.name ?? item?.skill ?? ''))
      .filter(Boolean)

  const lines = [
    `【${row.code ?? '(无代号)'}】职阶:${row.class_name ?? '?'} 类型:${row.card_type === 'MASTER' ? '御主' : '从者'}${Number(row.retired) ? '（已退场）' : ''}`,
    `- 职阶技能: ${namesOf(row.class_skills).join('、') || '（无）'}`,
    `- 保有技能: ${namesOf(row.personal_skills).join('、') || '（无）'}`,
    `- 宝具: ${namesOf(row.noble_phantasms).join('、') || '（无）'}`,
    `- 工坊: ${namesOf(row.workshops).join('、') || '（无）'}`,
    `- 礼装: ${namesOf(row.craft_essences).join('、') || '（无）'}`,
    '',
    '--- 卡面原文（截取）---',
    String(row.raw_text ?? '').slice(0, rawLimit),
  ]
  return lines.join('\n')
}

/**
 * 按关键词查卡。
 * 匹配范围：代号、职阶、卡面原文（LIKE 模糊），最多返回 5 张，原文超长截断。
 */
export function lookupCard(config = {}, keyword) {
  const kw = String(keyword ?? '').trim()
  if (!kw) return { text: '请提供关键词：职阶（弓/枪/剑/骑/杀/术/狂）、代号或卡面关键词。' }

  const db = openDb(config)
  const like = `%${kw}%`
  const rows = db
    .prepare(
      `SELECT code, class_name, card_type, retired, raw_text,
              class_skills, personal_skills, noble_phantasms, workshops, craft_essences
         FROM character_card
        WHERE code LIKE ? OR class_name LIKE ? OR raw_text LIKE ?
        ORDER BY id
        LIMIT 5`
    )
    .all(like, like, like)

  if (rows.length === 0) {
    return {
      text: `没查到匹配"${kw}"的角色卡。注意：库里的卡可能还没导入（A1 数据初始化），可以先用更短的词试试。`,
    }
  }

  const header = `查卡"${kw}"：命中 ${rows.length} 张（最多显示 5 张）。`
  const body = rows.map((row) => formatCard(row)).join('\n\n=====\n\n')
  return {
    text: `${header}\n\n${body}\n\n提醒：以上只是"有什么能力"；魔力消耗/回转/效果请用 gm_search_rule 按规则书核对。`,
  }
}

export { resolveConfig }
