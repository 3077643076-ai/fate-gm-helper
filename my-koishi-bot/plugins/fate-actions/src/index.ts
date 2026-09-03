import { Context, Schema } from 'koishi'
import { execFile } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export const name = 'fate-actions'

export interface Config {
  apiBase: string
  xlsxPath?: string
  actionLogScript?: string
  pythonBin?: string
  chatLogEnabled?: boolean
  chatLogPath?: string
}

export const Config: Schema<Config> = Schema.object({
  apiBase: Schema.string().default('http://localhost:8100/api').description('后端 API 基地址'),
  xlsxPath: Schema.string().default('').description('行动表 Excel 路径（填写后 .从者行动/.御主行动 会同步写入 Excel；留空则只提交后端）'),
  actionLogScript: Schema.string().default('X:\\dev\\dev\\fate-gm-helper-main\\.dsh\\skills\\action-log-xlsx\\scripts\\action_log.py').description('action_log.py 脚本路径'),
  pythonBin: Schema.string().default('python').description('python 可执行文件'),
  chatLogEnabled: Schema.boolean().default(true).description('把收到的群聊消息原样记到 JSONL（供 AI 总结后填 Excel）'),
  chatLogPath: Schema.string().default('X:\\dev\\dev\\fate-gm-helper-main\\1.15\\群聊记录-三国杯.jsonl').description('群聊记录文件路径（JSONL，每行一条消息）'),
})

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

// 从群名中识别阶职：剑组→剑、弓组→弓…（群名即阶职群）
function detectClassFromGroupName(groupName: string): string | null {
  const text = String(groupName || '')
  if (!text) return null
  if (text.includes('剑')) return '剑'
  if (text.includes('弓')) return '弓'
  if (text.includes('枪') || text.includes('槍')) return '枪'
  if (text.includes('骑')) return '骑'
  if (text.includes('杀')) return '杀'
  if (text.includes('术')) return '术'
  if (text.includes('狂')) return '狂'
  return null
}

export function apply(ctx: Context, config: Config) {
  // 运行 action_log.py 脚本（写 Excel / 查状态 / 推进时段）
  function runActionLog(args: string[]): Promise<string> {
    return new Promise((resolve) => {
      if (!config.xlsxPath) return resolve('')
      if (!config.actionLogScript) return resolve('（未配置 actionLogScript）')
      execFile(
        config.pythonBin || 'python',
        [config.actionLogScript, ...args, '--file', config.xlsxPath],
        { timeout: 20000, windowsHide: true, maxBuffer: 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err) {
            const detail = String(stderr || err.message || '').trim().slice(0, 300)
            resolve(`Excel操作失败：${detail || err.message}`)
          } else {
            resolve(String(stdout || '').trim())
          }
        },
      )
    })
  }

  // 通过 OneBot get_group_info 查询群名（群消息事件里不含群名，需要主动查询）
  async function resolveGroupName(session: any, guildId: string): Promise<string | null> {
    try {
      // 优先用 session.guild?.name（部分平台已附带）
      if (session?.guild?.name) return session.guild.name
      // 通过 OneBot 适配器的内部 API 查询群信息
      const bot = session?.bot
      if (bot?.getGuild) {
        const guild = await bot.getGuild(guildId)
        if (guild?.name) return guild.name
      }
      if (bot?.internal?.getGroupInfo) {
        const info = await bot.internal.getGroupInfo(guildId)
        if (info?.group_name) return info.group_name
      }
    } catch {
      /* 查不到群名时返回 null，由后端/前端显示兜底文案 */
    }
    return null
  }

  // 群名缓存：灵脉群的群名会随灵脉状态改名（如「白帝城 魔力量：20 人流量：2 战场宽度：4」），
  // 因此只做短期缓存，超时后重新查询以跟上改名。
  const GROUP_NAME_TTL = 60_000
  const groupNameCache = new Map<string, { name: string; at: number }>()
  async function resolveGroupNameCached(session: any, guildId: string): Promise<string | null> {
    const hit = groupNameCache.get(guildId)
    if (hit && Date.now() - hit.at < GROUP_NAME_TTL) return hit.name
    const name = await resolveGroupName(session, guildId)
    groupNameCache.set(guildId, { name: name || '', at: Date.now() })
    return name
  }
  function invalidateGroupName(guildId: string) {
    groupNameCache.delete(guildId)
  }

  // 群聊落盘：把所有收到的群聊文本原样记到 JSONL（独立于 Excel 写入，供 AI 总结后填表）
  if (config.chatLogEnabled && config.chatLogPath) {
    try { mkdirSync(dirname(config.chatLogPath), { recursive: true }) } catch { /* ignore */ }
    ctx.on('message', async (session: any) => {
      try {
        if (!session?.guildId) return            // 只记群聊，不记私聊
        const text = typeof session.content === 'string' ? session.content.trim() : ''
        if (!text) return
        if (session.userId && session.userId === session.selfId) return // 跳过机器人自己的消息
        const groupName = (await resolveGroupNameCached(session, session.guildId)) || ''
        const record = {
          ts: new Date().toISOString(),
          platform: session.platform || '',
          guildId: String(session.guildId),
          groupName,
          userId: String(session.userId || ''),
          nickname: session?.author?.name || session?.username || '',
          text,
        }
        appendFileSync(config.chatLogPath!, JSON.stringify(record) + '\n', 'utf8')
      } catch (e: any) {
        ctx.logger('chat-log').warn(`写入群聊记录失败: ${e?.message || e}`)
      }
    })
    ctx.logger('fate-actions').info(`群聊落盘已开启 → ${config.chatLogPath}`)
  }

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
        const groupName = await resolveGroupName(session, session.guildId)
        const binding = await ctx.http.post(`${config.apiBase}/qq-bindings`, {
          platform: session.platform,
          guildId: session.guildId,
          campaignId,
          groupName,
        })
        const name = binding?.campaignName || '（未命名战役）'
        const groupHint = groupName ? `群「${groupName}」` : '本群'
        return `已将${groupHint}绑定到战役 ID=${campaignId}，${name}`
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
    try {
      const bound = await ctx.http.get(`${config.apiBase}/qq-bindings`, {
        params: {
          platform: session.platform,
          guildId: session.guildId,
        },
      })
      return bound?.campaignId ?? null
    } catch {
      return null
    }
  }

  ctx.command('当前绑定', '查询本群绑定的战役')
    .action(async ({ session }) => {
      if (!session?.guildId) {
        return '本指令需要在群聊中使用。'
      }
      try {
        const bound = await ctx.http.get(`${config.apiBase}/qq-bindings`, {
          params: {
            platform: session.platform,
            guildId: session.guildId,
          },
        })
        if (!bound?.campaignId) return '本群尚未绑定战役。'
        const groupName = bound?.groupName
        const groupHint = groupName ? `群「${groupName}」` : '本群'
        return `${groupHint}当前绑定：战役 ID=${bound.campaignId}，${bound.campaignName || '（未命名战役）'}`
      } catch (e: any) {
        const msg = String(e?.response?.data || e?.message || e)
        return `查询绑定失败：${msg}`
      }
    })

  async function submitAction(options: {
    session: any
    campaignId: number
    servantClass: string
    actionType: 'SERVANT_ACTION' | 'MASTER_ACTION'
    content: string
  }) {
    const { session, campaignId, servantClass, actionType, content } = options
    const { raw, normalized } = normalizeServantClass(servantClass)
    // 阶职必须能映射到 弓枪骑剑杀术狂，否则无法归位到战斗表槽位
    const VALID_CLASSES = ['弓', '枪', '骑', '剑', '杀', '术', '狂']
    if (!VALID_CLASSES.includes(normalized)) {
      return '无法判定阶职：请在本群名包含阶职（如"剑组""弓组"）的群里发送，或在内容开头注明阶职（如：从者行动 剑 行动内容）。'
    }
    const submittedBy = session.username || session.userId || 'unknown'
    const classHint = raw === normalized ? normalized : `${raw}（已转换为${normalized}）`
    const results: string[] = []

    // 1) 后端提交（尽力而为，后端不可用时不影响 Excel 记录）
    try {
      await ctx.http.post(`${config.apiBase}/action-submissions`, {
        campaignId,
        servantClass: normalized,
        actionType,
        content,
        submittedBy,
      })
      results.push(`已提交${actionType === 'SERVANT_ACTION' ? '从者' : '御主'}行动（阶职：${classHint}）。`)
    } catch (e: any) {
      const msg = String(e?.response?.data || e?.message || e)
      if (msg.includes('没有处于开放状态的回合') || msg.includes('CLOSED')) {
        results.push('后端：当前战役没有开放中的回合，或本回合行动提交已关闭。')
      } else {
        results.push(`后端提交失败：${msg}`)
      }
    }

    // 2) Excel 同步写入（如配置了 xlsxPath）
    if (config.xlsxPath) {
      const excelOut = await runActionLog([
        'record',
        '--role', actionType === 'SERVANT_ACTION' ? 'SERVANT' : 'MASTER',
        '--class', normalized,
        '--text', content,
      ])
      results.push(`[Excel] ${excelOut || '（无输出）'}`)
    }
    return results.join('\n')
  }

  // 提交一条行动（自动判定阶职：群名优先，内容首词显式阶职次之）
  async function submitAutoClass(options: {
    session: any
    campaignId: number
    content: string
    actionType: 'SERVANT_ACTION' | 'MASTER_ACTION'
  }): Promise<string> {
    const { session, campaignId, content, actionType } = options
    const groupName = (await resolveGroupName(session, session.guildId)) || ''
    const clsFromGroup = detectClassFromGroupName(groupName)
    const firstToken = String(content).trim().split(/\s+/)[0] || ''
    const explicit = normalizeServantClass(firstToken)
    const hasExplicitClass = explicit.normalized !== firstToken
    const servantClass = hasExplicitClass ? firstToken : (clsFromGroup || firstToken)
    const body = hasExplicitClass ? String(content).trim().slice(firstToken.length).trim() : content
    return submitAction({
      session,
      campaignId,
      servantClass,
      actionType,
      content: body,
    })
  }

  // 把多行内容拆成多条指令：如 "从者行动 A\n御主行动 B" 会被拆成两条
  // 支持换行符前面带不带 . 前缀
  function splitMultiLine(content: string): string[] {
    const lines = String(content || '').split(/\r?\n/)
    const out: string[] = []
    let current = ''
    for (const line of lines) {
      const t = line.trim()
      if (/^\.?(从者行动|御主行动)\s/.test(t)) {
        if (current.trim()) out.push(current.trim())
        current = t.replace(/^\./, '')
      } else if (current) {
        current += '\n' + line
      } else if (t) {
        current = line
      }
    }
    if (current.trim()) out.push(current.trim())
    return out
  }

  // 从者行动：从者行动 内容（阶职由所在群名自动判定，如"剑组"→剑）
  // 也支持多行：从者行动 A\n御主行动 B
  ctx.command('从者行动 <content:text>', '提交从者行动（阶职由群名自动判定）')
    .action(async ({ session }, content) => {
      if (!session) return
      const campaignId = await getBoundCampaignId(session)
      if (!campaignId) {
        return '本群尚未绑定战役，请先使用 “绑定战役 战役ID”。'
      }
      if (!content) {
        return '用法：从者行动 行动内容（在阶职群中发送，自动判定阶职）'
      }
      const parts = splitMultiLine(content)
      if (parts.length === 0) return '内容为空。'
      const results: string[] = []
      for (const part of parts) {
        const m = part.match(/^(从者行动|御主行动)\s+([\s\S]+)$/)
        if (m) {
          const type = m[1] === '从者行动' ? 'SERVANT_ACTION' : 'MASTER_ACTION'
          results.push(await submitAutoClass({ session, campaignId, content: m[2].trim(), actionType: type }))
        } else {
          results.push(await submitAutoClass({ session, campaignId, content: part, actionType: 'SERVANT_ACTION' }))
        }
      }
      return results.join('\n')
    })

  // 御主行动：御主行动 内容（阶职由所在群名自动判定）
  ctx.command('御主行动 <content:text>', '提交御主行动（阶职由群名自动判定）')
    .action(async ({ session }, content) => {
      if (!session) return
      const campaignId = await getBoundCampaignId(session)
      if (!campaignId) {
        return '本群尚未绑定战役，请先使用 “绑定战役 战役ID”。'
      }
      if (!content) {
        return '用法：御主行动 行动内容（在阶职群中发送，自动判定阶职）'
      }
      const parts = splitMultiLine(content)
      if (parts.length === 0) return '内容为空。'
      const results: string[] = []
      for (const part of parts) {
        const m = part.match(/^(从者行动|御主行动)\s+([\s\S]+)$/)
        if (m) {
          const type = m[1] === '从者行动' ? 'SERVANT_ACTION' : 'MASTER_ACTION'
          results.push(await submitAutoClass({ session, campaignId, content: m[2].trim(), actionType: type }))
        } else {
          results.push(await submitAutoClass({ session, campaignId, content: part, actionType: 'MASTER_ACTION' }))
        }
      }
      return results.join('\n')
    })

  // 介入：介入到目标灵脉（立即介入目标指令，可视为紧急机动）
  ctx.command('介入 <content:text>', '介入到目标灵脉/指令（如：介入到灵脉-A）')
    .action(async ({ session }, content) => {
      if (!session) return
      const campaignId = await getBoundCampaignId(session)
      if (!campaignId) {
        return '本群尚未绑定战役，请先使用 “绑定战役 战役ID”。'
      }
      if (!content) {
        return '用法：介入 介入到灵脉-A（在阶职群中发送，阶职由群名自动判定）'
      }
      const groupName = (await resolveGroupName(session, session.guildId)) || ''
      const clsFromGroup = detectClassFromGroupName(groupName)
      const firstToken = String(content).trim().split(/\s+/)[0] || ''
      const explicit = normalizeServantClass(firstToken)
      const hasExplicitClass = explicit.normalized !== firstToken
      const servantClass = hasExplicitClass ? firstToken : (clsFromGroup || firstToken)
      const body = hasExplicitClass ? String(content).trim().slice(firstToken.length).trim() : content
      return submitAction({
        session,
        campaignId,
        servantClass,
        actionType: 'SERVANT_ACTION',
        content: `介入-${body}`,
      })
    })

  // 下一时段：把行动表 Excel 推进到下一时段（跳伞→第1天昼→第1天夜→…→第14天夜）
  ctx.command('下一时段', '把行动表 Excel 推进到下一时段（跳伞→第1天昼→…→第14天夜）')
    .action(async () => {
      if (!config.xlsxPath) return '本机器人未配置行动表 Excel（xlsxPath），无法推进。'
      const out = await runActionLog(['advance'])
      return out || '推进失败（无输出）。'
    })

  // 行动表：查看行动表 Excel 当前状态（当前时段 + 已填格子）
  ctx.command('行动表', '查看行动表 Excel 当前状态')
    .action(async () => {
      if (!config.xlsxPath) return '本机器人未配置行动表 Excel（xlsxPath），无法查询。'
      const out = await runActionLog(['status'])
      return out || '查询失败（无输出）。'
    })

  // 改群名：灵脉群的群名即灵脉状态展示（如「白帝城 魔力量：20 人流量：2 战场宽度：4」），
  // 灵脉状态变化时可直接让机器人改群名，同时刷新日志里的群名缓存。
  ctx.command('改群名 <name:text>', '修改本群群名（需要机器人为群主/管理员）')
    .action(async ({ session }, name) => {
      if (!session?.guildId) return '本指令需要在群聊中使用。'
      const bot: any = session.bot
      if (!bot?.internal?.setGroupName) return '当前平台不支持改群名（需要 OneBot set_group_name）。'
      const target = String(name || '').trim()
      if (!target) return '用法：改群名 新群名（如：改群名 白帝城 魔力量：20 人流量：2 战场宽度：4）'
      try {
        await bot.internal.setGroupName(session.guildId, target)
        invalidateGroupName(String(session.guildId))
        return `已将本群名改为：${target}`
      } catch (e: any) {
        const msg = String(e?.response?.data || e?.message || e)
        return `改群名失败（可能机器人不是群主/管理员，或协议端不支持）：${msg}`
      }
    })

  // 公告：发布群公告（OneBot 扩展动作 _send_group_notice，NapCat 支持；需机器人为群主/管理员）
  ctx.command('公告 <content:text>', '在本群发布群公告（需要机器人为群主/管理员）')
    .action(async ({ session }, content) => {
      if (!session?.guildId) return '本指令需要在群聊中使用。'
      const bot: any = session.bot
      if (!bot?.internal?.sendGroupNotice) return '当前平台不支持发布群公告（需要 OneBot 扩展 _send_group_notice）。'
      const target = String(content || '').trim()
      if (!target) return '用法：公告 内容'
      try {
        await bot.internal.sendGroupNotice(session.guildId, target)
        return '公告已发布。'
      } catch (e: any) {
        const msg = String(e?.response?.data || e?.message || e)
        return `发布公告失败（可能机器人不是群主/管理员，或协议端不支持）：${msg}`
      }
    })

  // 群列表：列出机器人所在的所有群（guildId + 群名），用于核对私组/灵脉群/公屏/袭击组等群分类
  ctx.command('群列表', '列出机器人所在的所有群（guildId + 群名）')
    .action(async ({ session }) => {
      const bot: any = session?.bot
      if (!bot?.internal?.getGroupList) return '当前平台不支持 get_group_list。'
      try {
        const list = await bot.internal.getGroupList()
        if (!Array.isArray(list) || !list.length) return '机器人当前不在任何群。'
        return list
          .map((g: any) => `${g.group_id}\t${g.group_name || ''}`)
          .join('\n')
      } catch (e: any) {
        const msg = String(e?.response?.data || e?.message || e)
        return `获取群列表失败：${msg}`
      }
    })

  // 群成员：列出本群成员（或指定群号）
  ctx.command('群成员 [gid:string]', '列出群成员（QQ号/昵称/群名片/身份），默认本群')
    .action(async ({ session }, gid) => {
      const bot: any = session?.bot
      if (!bot?.internal?.getGroupMemberList) return '当前平台不支持 get_group_member_list。'
      const groupId = (gid && gid.trim()) || session?.guildId
      if (!groupId) return '请提供群号，或在本群内使用本指令。'
      try {
        const list = await bot.internal.getGroupMemberList(groupId)
        if (!Array.isArray(list) || !list.length) return '查询不到成员。'
        return list
          .map((m: any) => {
            const roleTag = m.role === 'owner' ? '群主' : m.role === 'admin' ? '管理' : ''
            const card = m.card && m.card !== m.nickname ? `(${m.card})` : ''
            return `${m.user_id}\t${m.nickname || ''}${card}${roleTag ? '\t' + roleTag : ''}`
          })
          .join('\n')
      } catch (e: any) {
        const msg = String(e?.response?.data || e?.message || e)
        return `获取群成员失败：${msg}`
      }
    })

  // HTML 实体解码（公告文本带 &#10; / &nbsp; 等转义）
  function decodeEntities(s: string): string {
    return String(s || '')
      .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim()
  }
  // 从公告对象里取正文（message 可能是 {text} 对象 / 字符串 / content 字段）
  function noticeText(n: any): string {
    const m = n?.message
    if (m && typeof m === 'object' && m.text != null) return String(m.text)
    if (typeof m === 'string') return m
    if (n?.content) return String(n.content)
    return ''
  }

  // 群公告：读取本群当前公告（玩家习惯用改公告表达下一回合行动）
  ctx.command('群公告', '读取本群当前公告（需协议端支持 _get_group_notice）')
    .action(async ({ session }) => {
      const bot: any = session?.bot
      if (!session?.guildId) return '本指令需要在群聊中使用。'
      if (!bot?.internal?.getGroupNotice) return '当前平台不支持读取群公告。'
      try {
        const notices = await bot.internal.getGroupNotice(session.guildId)
        const arr = Array.isArray(notices) ? notices : []
        if (!arr.length) return '本群当前没有公告。'
        return arr
          .map((n: any, i: number) => {
            const t = decodeEntities(noticeText(n))
            const d = n.publish_time ? new Date(n.publish_time * 1000).toISOString().slice(0, 16) : ''
            return `${i + 1}. [${d}] ${t || '(无正文)'}`
          })
          .join('\n')
      } catch (e: any) {
        const msg = String(e?.response?.data || e?.message || e)
        return `读取群公告失败：${msg}`
      }
    })

  // 确认行动：读取本群当前公告并回发一条机器人确认公告（玩家确认行动用）
  ctx.command('确认行动', '读取本群公告并回发一条「✅ 机器人已确认」公告')
    .action(async ({ session }) => {
      if (!session?.guildId) return '本指令需要在群聊中使用。'
      const bot: any = session.bot
      if (!bot?.internal?.getGroupNotice || !bot?.internal?.sendGroupNotice) {
        return '当前平台不支持读取/发布群公告（需要机器人是本群群主/管理员）。'
      }
      try {
        const notices = await bot.internal.getGroupNotice(session.guildId)
        const arr = Array.isArray(notices) ? notices : []
        let text = ''
        for (const n of arr) {
          text = noticeText(n)
          if (text) break
        }
        if (!text) return '本群当前没有公告内容可确认（先在公告里写好行动再确认）。'
        const clean = decodeEntities(text)
        const cst = new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(5, 16)
        const confirmText = `✅ 机器人已确认 ${cst}\n${clean}`
        await bot.internal.sendGroupNotice(session.guildId, confirmText)
        return `已读取本群公告并回发确认公告 ✅\n${confirmText}`
      } catch (e: any) {
        const msg = String(e?.response?.data || e?.message || e)
        return `确认失败（可能机器人不是本群群主/管理员）：${msg}`
      }
    })
}
