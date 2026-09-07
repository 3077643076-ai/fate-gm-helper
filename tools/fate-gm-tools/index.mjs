// fate-gm-tools 服务端入口
// ========================
// 职责三件事：
//   1. 注册 gm_mode 开关工具（全局可见，唯一常驻残留）
//   2. 激活后注册五个业务工具（查卡/搜规则/记账/结算/判定单）
//   3. 只对"已激活会话"注入带团铁律（system-prompt/assemble 瀑布）
//
// 设计依据（对 dsh 内置插件源码的观察 + 实测调通记录见 NOTES.md）：
//   - 工具注册：ctx.tools.register({ name, description, parameters, output, execute })
//     （范例：~/.dsh/.agent-presets/liangshen/custom-bash.mjs）
//   - execute 第二参里有 exec.agent.session，可定位当前会话
//   - 系统提示瀑布：ctx.on('system-prompt/assemble', (assembly, context, next) => ...)
//     （范例：tool-bootstrap.mjs；sections 元素形状为 { name, text }）
//   - 系统提示瀑布每次请求都会执行，因此激活/关闭在下一轮对话立即生效

// cordis 插件名（loader 诊断用）
export const name = 'fate-gm-tools'

// 声明依赖的服务：tools 注册表必须在插件 apply 之前存在
// （缺这行会在 ctx.tools 访问时报 cannot get property "tools" without inject）
export const inject = ['tools']

// 会话激活状态（进程内保存；dsh 重启即清空，带团会话重新说一句"开带团模式"即可。
// 故意不持久化：避免哪天状态残留污染日常使用）
const activatedSessions = new Set()

// 业务工具只注册一次的标志（工具目录是进程级的）
let gmToolsRegistered = false

// 工具统一输出声明：dsh 要求每个工具声明 output { schema, render }
// 我们的工具全部返回 { text }，渲染为纯文本
const TEXT_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      text: { type: 'string' },
    },
    required: ['text'],
  },
  render: (_args, value) => [{ type: 'text', text: value.text }],
}

/** 带团铁律文本：激活会话才注入，内容为 docs/带团SOP.md v0.3 的浓缩版 */
const GM_RULES_TEXT = [
  '【三国杯带团模式 · 铁律】（违反即事故）',
  '1. 状态只信库：魔力/令咒/位置/灵脉归属，回答前先查库（gm 工具），禁止凭记忆回答。',
  '2. 数值信规则书：角色卡只提供"有什么能力"的名字；魔力消耗/回转/具体效果一律以',
  '   规则书/资源库为准（gm_search_rule 核对原文）。卡面与规则书冲突时按规则书执行',
  '   并提醒 GM；规则书也查不到的标"需裁决"，禁止凭印象编效果。',
  '3. 出群先判可见性：发灵脉群/公屏前先查场上状态（宝具/结界的隐藏信息效果），',
  '   灵脉群与公屏禁止出现职阶和主从配对，一律用代号；私组可用。',
  '4. 投点必须挂判定单（gm_ticket）：无单骰子=无效投点自动忽略；同一判定取最早的',
  '   确定投点；玩家目标值投错时按正确口径重判，重判通过即过，重判不过则从宽+警告并留痕。',
  '5. 结算前置：需裁决未清空不开结；供魔口径先冻结再入账；结算后逐项核对名片/群名/公告去重。',
  '完整流程见项目 docs/带团SOP.md。需裁决事项不猜测执行，列出等 GM 拍板。',
].join('\n')

/** 业务工具的实现模块延迟加载（避免休眠会话付出加载成本） */
async function loadGmModules() {
  return {
    lookup: await import('./lib/lookup.mjs'),
    search: await import('./lib/search.mjs'),
    ledger: await import('./lib/ledger.mjs'),
    store: await import('./lib/store.mjs'),
    ticket: await import('./lib/ticket.mjs'),
  }
}

/**
 * 注册五个业务工具（幂等：只有第一次调用会真正注册）。
 * 工具目录是进程级的，无法按会话摘除，因此休眠会话里调用它们时
 * 统一返回"未开启带团模式"提示，不执行任何实际操作。
 */
function ensureGmTools(ctx, config) {
  if (gmToolsRegistered) return
  gmToolsRegistered = true

  /** 业务工具共用的会话守卫：未激活的会话拿到提示而非结果 */
  function guard(sessionId) {
    if (activatedSessions.has(sessionId)) return null
    return {
      text: '带团模式未开启。请让 GM 在本会话说一句"开带团模式"后再使用 gm 业务工具。',
    }
  }

  /** 从 execute 上下文取当前会话 id（取不到时用固定占位，保证不崩溃） */
  function sessionIdOf(exec) {
    return exec?.agent?.session?.id ?? '(unknown-session)'
  }

  // ---------- 查卡：输出能力名清单 + 卡面原文（规则书查无时的参考） ----------
  ctx.tools.register({
    name: 'gm_lookup_card',
    description: [
      '查《空想圣杯》角色卡：按职阶/代号/关键词查某个单位的卡面。',
      '返回能力（技能/宝具/礼装）名字清单 + 卡面原文。',
      '注意：卡面只提供"有什么能力"的名字；魔力消耗/回转/效果必须再用 gm_search_rule 按规则书核对。',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '职阶（弓/枪/剑/骑/杀/术/狂）、角色代号或卡面关键词' },
      },
      required: ['keyword'],
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const blocked = guard(sessionIdOf(exec))
      if (blocked) return blocked
      const mods = await loadGmModules()
      return mods.lookup.lookupCard(config, String(args.keyword ?? ''))
    },
  })

  // ---------- 搜规则：规则书/资源库关键词检索（带出处） ----------
  ctx.tools.register({
    name: 'gm_search_rule',
    description: [
      '搜《空想圣杯》规则书/资源库（knowledge/ 目录）：按关键词返回原文片段和出处（文件+行号）。',
      '能力的数值与效果的权威来源。查卡得到技能名之后，必须用本工具核对权威数值。',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '技能名/宝具名/规则关键词（支持标准名或常见写法）' },
      },
      required: ['keyword'],
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const blocked = guard(sessionIdOf(exec))
      if (blocked) return blocked
      const mods = await loadGmModules()
      return mods.search.searchRule(config, String(args.keyword ?? ''))
    },
  })

  // ---------- 记账：魔力变动流水入库 ----------
  ctx.tools.register({
    name: 'gm_ledger_record',
    description: [
      '魔力账本记账：角色魔力发生任何变动（供魔/消耗/转移/魂食等）时，立即写一笔流水。',
      '数字必须来自原文或判定结果，禁止心算合并多笔。',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        role: { type: 'string', description: '角色（职阶或代号，如 狂/魏延）' },
        delta: { type: 'number', description: '变动量，加为正数、减为负数' },
        reason: { type: 'string', description: '事由（如 洛阳奏乐成功+30）' },
        source: { type: 'string', description: '来源（公告/判定/技能/转移）' },
        round: { type: 'number', description: '回合号（第几天）' },
        phase: { type: 'string', description: '时段（昼/夜）' },
      },
      required: ['role', 'delta', 'reason'],
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const blocked = guard(sessionIdOf(exec))
      if (blocked) return blocked
      const mods = await loadGmModules()
      return mods.ledger.record(config, args)
    },
  })

  // ---------- 结算：账本汇总（逐笔明细 + 当前余额） ----------
  ctx.tools.register({
    name: 'gm_ledger_summarize',
    description: [
      '魔力账本汇总：按角色（或全员）输出逐笔明细与当前合计。',
      '结算对账硬步骤用本工具：账本合计与角色状态不一致时停止播报并报告 GM。',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        role: { type: 'string', description: '可选，只汇总某个角色；不填=全员' },
      },
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const blocked = guard(sessionIdOf(exec))
      if (blocked) return blocked
      const mods = await loadGmModules()
      return mods.ledger.summarize(config, args.role ? String(args.role) : '')
    },
  })

  // ---------- 判定单：投点登记制（SOP 3.4b） ----------
  ctx.tools.register({
    name: 'gm_ticket',
    description: [
      '判定单管理：立单（行动需要判定时）/挂点（骰子归属确认）/列出/作废。',
      '投点登记制：无单骰子=无效投点；同一判定取最早的确定投点，重复挂点被拒绝。',
      'action 取值：list / create / attach / void。',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'list / create / attach / void' },
        role: { type: 'string', description: '角色（主/从明确）' },
        actionName: { type: 'string', description: '行动名（create 用）' },
        target: { type: 'number', description: '判定目标值（create 用）' },
        ticketId: { type: 'number', description: '判定单编号（attach/void 用）' },
        roll: { type: 'number', description: '骰子出目（attach 用）' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const blocked = guard(sessionIdOf(exec))
      if (blocked) return blocked
      const mods = await loadGmModules()
      return mods.ticket(config, sessionIdOf(exec), args)
    },
  })
}

/** 插件入口：cordis 加载本包时调用 */
export function apply(ctx, config = {}) {
  // 1) 全局唯一的常驻开关工具（所有会话可见，休眠态的唯一存在）
  ctx.tools.register({
    name: 'gm_mode',
    description: [
      '三国杯带团模式开关。',
      '当用户要求开启/关闭带团模式（如"开带团模式""今天带团""关掉带团模式"）时调用。',
      '开启后：本会话上线 GM 业务工具（查卡/搜规则/记账/结算/判定单）并注入带团铁律。',
      '关闭后：本会话回到普通模式。只影响当前会话，不影响其他会话。',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '"on" 开启，"off" 关闭', enum: ['on', 'off'] },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const sessionId = exec?.agent?.session?.id ?? '(unknown-session)'
      if (args.action === 'on') {
        activatedSessions.add(sessionId)
        ensureGmTools(ctx, config)
        return {
          text: [
            '带团模式已开启（仅本会话生效）：',
            '- 上线工具：gm_lookup_card（查卡）、gm_search_rule（搜规则）、',
            '  gm_ledger_record（记账）、gm_ledger_summarize（结算）、gm_ticket（判定单）',
            '- 带团铁律已注入（状态只信库/数值信规则书/出群判可见性/投点挂单/结算前置）',
            '提醒：涉及魔力变动请立即 gm_ledger_record；引用能力效果前先 gm_search_rule。',
          ].join('\n'),
        }
      }
      activatedSessions.delete(sessionId)
      return { text: '带团模式已关闭（本会话）。业务工具对当前会话不再生效。' }
    },
  })

  // 2) 系统提示瀑布：只对已激活会话追加铁律段落
  //    （瀑布每次请求都会执行，因此开关在下一轮对话立即生效）
  ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    const assembled = await next()
    const sessionId = context?.agent?.session?.id ?? '(unknown-session)'
    if (!activatedSessions.has(sessionId)) return assembled

    const sections = Array.isArray(assembled.sections) ? assembled.sections : []
    // 已注入过就不重复（防同一请求多次 assemble 叠加）
    if (sections.some((s) => s?.name === 'fate-gm-rules')) return assembled
    return {
      ...assembled,
      sections: [...sections, { name: 'fate-gm-rules', text: GM_RULES_TEXT }],
    }
  })
}
