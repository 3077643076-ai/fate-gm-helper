import { Context, Schema } from 'koishi'

export const name = 'fate-actions'

export interface Config {
  apiBase: string
}

export const Config: Schema<Config> = Schema.object({
  apiBase: Schema.string().default('http://localhost:8080/api').description('后端 API 基地址'),
})

// 简单的内存绑定：{ 平台:频道 } -> { campaignId }
// 如果需要持久化，可以改成使用 Koishi 数据库表来保存
const bindings = new Map<string, { campaignId: number }>()

function bindingKey(platform: string, guildId: string) {
  return `${platform}:${guildId}`
}

function normalizeServantClass(cls: string): { raw: string; normalized: string } {
  const raw = (cls || '').trim()
  const text = raw.toLowerCase()
  if (text.includes('archer') || text.includes('弓')) return { raw, normalized: '弓' }
  if (text.includes('lancer') || text.includes('枪') || text.includes('槍')) return { raw, normalized: '枪' }
  if (text.includes('rider') || text.includes('骑')) return { raw, normalized: '骑' }
  if (text.includes('saber') || text.includes('剑')) return { raw, normalized: '剑' }
  if (text.includes('assassin') || text.includes('杀')) return { raw, normalized: '杀' }
  if (text.includes('caster') || text.includes('术')) return { raw, normalized: '术' }
  if (text.includes('berserker') || text.includes('狂')) return { raw, normalized: '狂' }
  // 未识别则用原值
  return { raw, normalized: raw }
}

/** 规则书9种结算类别：机动/魂食/干涉/解放/制造/信息/休整/协助/介入 */
const PHASE_TYPE_ALIASES: Record<string, string> = {
  '机动': 'MANEUVER', '移动': 'MANEUVER', '逃跑': 'MANEUVER', '撤退': 'MANEUVER',
  '魂食': 'SOUL_EAT', '捕食': 'SOUL_EAT',
  '干涉': 'INTERFERE', '攻击': 'INTERFERE', '战斗': 'INTERFERE', '防御': 'INTERFERE',
  '解放': 'LIBERATE', '宝具': 'LIBERATE', '真名': 'LIBERATE',
  '制造': 'CREATE', '工坊': 'CREATE', '道具': 'CREATE', '礼装': 'CREATE',
  '信息': 'INTEL', '侦察': 'INTEL', '情报': 'INTEL', '搜索': 'INTEL', '感知': 'INTEL',
  '休整': 'REST', '恢复': 'REST', '治疗': 'REST', '休息': 'REST',
  '协助': 'ASSIST', '支援': 'ASSIST', '帮助': 'ASSIST',
  '介入': 'INTERVENE', '参战': 'INTERVENE',
}

function normalizePhaseType(text: string): string | null {
  const t = (text || '').trim()
  // 先尝试英文枚举名直接匹配
  const upper = t.toUpperCase()
  const validEnums = ['MANEUVER', 'SOUL_EAT', 'INTERFERE', 'LIBERATE', 'CREATE', 'INTEL', 'REST', 'ASSIST', 'INTERVENE']
  if (validEnums.includes(upper)) return upper
  // 中文别名匹配
  for (const [alias, enumVal] of Object.entries(PHASE_TYPE_ALIASES)) {
    if (t.includes(alias)) return enumVal
  }
  return null // 未识别，让服务端自动检测
}

export function apply(ctx: Context, config: Config) {
  // 绑定战役指令
  ctx.command('绑定战役 <campaignId:number>', '将本群绑定到指定战役')
    .action(async ({ session }, campaignId) => {
      if (!session?.guildId) {
        return '本指令需要在群聊中使用。'
      }
      if (!campaignId) {
        return '请提供战役 ID，例如：绑定战役 3'
      }
      try {
        const campaign = await ctx.http.get(`${config.apiBase}/campaigns/${campaignId}`)
        const key = bindingKey(session.platform, session.guildId)
        bindings.set(key, { campaignId })
        const name = campaign?.name || '（未命名战役）'
        return `已将本群绑定到战役 ID=${campaignId}，${name}`
      } catch (e: any) {
        const msg = String(e?.response?.data || e?.message || e)
        if (msg.includes('404') || msg.includes('Not Found')) {
          return `未找到 ID 为 ${campaignId} 的战役，请确认 ID 是否正确（战役只能由网页端创建）。`
        }
        return `查询战役失败：${msg}`
      }
    })

  async function getBoundCampaignId(session: any): Promise<number | null> {
    if (!session?.guildId) return null
    const key = bindingKey(session.platform, session.guildId)
    const bound = bindings.get(key)
    return bound?.campaignId ?? null
  }

  function checkGroupNameForClass(session: any, servantClass: string): string | null {
    const groupName: string = session?.guild?.name || ''
    if (!groupName) return null
    // 简单规则：如果群名中不包含该阶职关键字，则给出警告
    if (!groupName.includes(servantClass)) {
      return `注意：本群名称「${groupName}」中不包含阶职「${servantClass}」，请确认是否在正确的阶职群中提交。`
    }
    return null
  }

  async function submitAction(options: {
    session: any
    campaignId: number
    servantClass: string
    actionType: 'SERVANT_ACTION' | 'MASTER_ACTION'
    phaseType: string | null
    content: string
  }) {
    const { session, campaignId, servantClass, actionType, phaseType, content } = options
    const { raw, normalized } = normalizeServantClass(servantClass)
    const submittedBy = session.username || session.userId || 'unknown'
    const body: any = {
      campaignId,
      servantClass: normalized,
      actionType,
      content,
      submittedBy,
    }
    // 只有玩家明确指定了类别才传 phaseType，否则让服务端自动检测
    if (phaseType) {
      body.phaseType = phaseType
    }
    try {
      await ctx.http.post(`${config.apiBase}/action-submissions`, body)
      const warn = checkGroupNameForClass(session, normalized)
      const classHint = raw === normalized ? normalized : `${raw}（已转换为${normalized}）`
      const phaseLabel = phaseType ? `[${phaseType}] ` : ''
      const okMsg = `已提交${phaseLabel}${actionType === 'SERVANT_ACTION' ? '从者' : '御主'}行动（阶职：${classHint}）。`
      return warn ? `${okMsg}\n${warn}` : okMsg
    } catch (e: any) {
      const msg = String(e?.response?.data || e?.message || e)
      if (msg.includes('没有处于开放状态的回合') || msg.includes('CLOSED')) {
        return '当前战役没有开放中的回合，或本回合行动提交已关闭。'
      }
      return `提交失败：${msg}`
    }
  }

  // 从者行动：从者行动 阶职 [类别] 内容
  // 类别（机动/干涉/解放/制造/信息/休整/协助/介入/魂食）可选，不填则自动检测
  ctx.command('从者行动 <servantClass:string> [...args:text]', '提交从者行动，可选指定行动类别')
    .action(async ({ session }, servantClass, ...args) => {
      if (!session) return
      const campaignId = await getBoundCampaignId(session)
      if (!campaignId) {
        return '本群尚未绑定战役，请先使用 “绑定战役 战役ID”。'
      }
      if (!servantClass || args.length === 0) {
        return '用法：从者行动 阶职 [类别] 行动内容\n类别可选：机动/魂食/干涉/解放/制造/信息/休整/协助/介入'
      }
      // 尝试解析第一个参数是否是行动类别
      const rawArgs: string[] = args.filter(a => typeof a === 'string')
      const firstArg = rawArgs[0] || ''
      const phaseType = normalizePhaseType(firstArg)
      let content: string
      if (phaseType) {
        // 第一个参数是类别，剩余为内容
        content = rawArgs.slice(1).join(' ')
      } else {
        // 没有匹配的类别，全部作为内容
        content = rawArgs.join(' ')
      }
      if (!content.trim()) {
        return '请提供行动内容。\n用法：从者行动 阶职 [类别] 行动内容'
      }
      return submitAction({
        session,
        campaignId,
        servantClass,
        actionType: 'SERVANT_ACTION',
        phaseType,
        content: content.trim(),
      })
    })

  // 御主行动：御主行动 阶职 [类别] 内容
  ctx.command('御主行动 <servantClass:string> [...args:text]', '提交御主行动，可选指定行动类别')
    .action(async ({ session }, servantClass, ...args) => {
      if (!session) return
      const campaignId = await getBoundCampaignId(session)
      if (!campaignId) {
        return '本群尚未绑定战役，请先使用 “绑定战役 战役ID”。'
      }
      if (!servantClass || args.length === 0) {
        return '用法：御主行动 阶职 [类别] 行动内容\n类别可选：机动/魂食/干涉/解放/制造/信息/休整/协助/介入'
      }
      const rawArgs: string[] = args.filter(a => typeof a === 'string')
      const firstArg = rawArgs[0] || ''
      const phaseType = normalizePhaseType(firstArg)
      let content: string
      if (phaseType) {
        content = rawArgs.slice(1).join(' ')
      } else {
        content = rawArgs.join(' ')
      }
      if (!content.trim()) {
        return '请提供行动内容。\n用法：御主行动 阶职 [类别] 行动内容'
      }
      return submitAction({
        session,
        campaignId,
        servantClass,
        actionType: 'MASTER_ACTION',
        phaseType,
        content: content.trim(),
      })
    })
}


