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
    content: string
  }) {
    const { session, campaignId, servantClass, actionType, content } = options
    const { raw, normalized } = normalizeServantClass(servantClass)
    const submittedBy = session.username || session.userId || 'unknown'
    try {
      await ctx.http.post(`${config.apiBase}/action-submissions`, {
        campaignId,
        servantClass: normalized,
        actionType,
        content,
        submittedBy,
      })
      const warn = checkGroupNameForClass(session, normalized)
      const classHint = raw === normalized ? normalized : `${raw}（已转换为${normalized}）`
      const okMsg = `已提交${actionType === 'SERVANT_ACTION' ? '从者' : '御主'}行动（阶职：${classHint}）。`
      return warn ? `${okMsg}\n${warn}` : okMsg
    } catch (e: any) {
      const msg = String(e?.response?.data || e?.message || e)
      if (msg.includes('没有处于开放状态的回合') || msg.includes('CLOSED')) {
        return '当前战役没有开放中的回合，或本回合行动提交已关闭。'
      }
      return `提交失败：${msg}`
    }
  }

  // 从者行动：从者行动 阶职 内容
  ctx.command('从者行动 <servantClass:string> <content:text>', '提交从者行动')
    .action(async ({ session }, servantClass, content) => {
      if (!session) return
      const campaignId = await getBoundCampaignId(session)
      if (!campaignId) {
        return '本群尚未绑定战役，请先使用 “绑定战役 战役ID”。'
      }
      if (!servantClass || !content) {
        return '用法：从者行动 阶职 行动内容'
      }
      return submitAction({
        session,
        campaignId,
        servantClass,
        actionType: 'SERVANT_ACTION',
        content,
      })
    })

  // 御主行动：御主行动 阶职 内容
  ctx.command('御主行动 <servantClass:string> <content:text>', '提交御主行动')
    .action(async ({ session }, servantClass, content) => {
      if (!session) return
      const campaignId = await getBoundCampaignId(session)
      if (!campaignId) {
        return '本群尚未绑定战役，请先使用 “绑定战役 战役ID”。'
      }
      if (!servantClass || !content) {
        return '用法：御主行动 阶职 行动内容'
      }
      return submitAction({
        session,
        campaignId,
        servantClass,
        actionType: 'MASTER_ACTION',
        content,
      })
    })
}


