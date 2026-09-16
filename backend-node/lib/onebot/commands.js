// 群指令处理器：把 fate-actions（Koishi 插件）的 15 条指令迁到后端本地
// 指令行为与原插件保持一致，差别只有两点：
//   1. 收发消息不再走 Koishi，直接通过 wsBot 调 OneBot 动作
//   2. 战役数据操作改为 fetch 本机后端 HTTP API（原插件调 apiBase，这里是同机 localhost，
//      行为和错误文案完全一致；Excel 相关的 2 条指令因依赖旧机器路径已降级为提示）

const { appendFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

// ---------- 职阶识别（照搬 fate-actions） ----------

// 七个标准职阶：提交行动时只接受这些槽位
const VALID_CLASSES = ['弓', '枪', '骑', '剑', '杀', '术', '狂'];

// 把玩家输入的职阶词归一化到七个标准职阶：弓枪骑剑杀术狂
function normalizeServantClass(cls) {
  const raw = (cls || '').trim();
  const text = raw.toLowerCase();
  if (text.includes('archer') || text.includes('弓')) return { raw, normalized: '弓' };
  if (text.includes('lancer') || text.includes('枪') || text.includes('槍')) return { raw, normalized: '枪' };
  if (text.includes('rider') || text.includes('骑')) return { raw, normalized: '骑' };
  if (text.includes('saber') || text.includes('剑')) return { raw, normalized: '剑' };
  if (text.includes('assassin') || text.includes('杀')) return { raw, normalized: '杀' };
  if (text.includes('caster') || text.includes('术')) return { raw, normalized: '术' };
  if (text.includes('berserker') || text.includes('狂')) return { raw, normalized: '狂' };
  // 未识别保持原值，由调用方报错提示
  return { raw, normalized: raw };
}

// 从群名里识别职阶（职阶群约定把职阶字写进群名，比如"弓组-降临"）
function detectClassFromGroupName(groupName) {
  const text = String(groupName || '');
  if (!text) return null;
  if (text.includes('弓')) return '弓';
  if (text.includes('骑')) return '骑';
  if (text.includes('枪') || text.includes('槍')) return '枪';
  if (text.includes('剑')) return '剑';
  if (text.includes('杀')) return '杀';
  if (text.includes('术')) return '术';
  if (text.includes('狂')) return '狂';
  return null;
}

// 多行拆分：一条消息里写多行"从者行动/御主行动"时拆成多次提交
// （行首的 . 前缀可有可无，比如 ".从者行动 A\n御主行动 B"）
function splitMultiLine(content) {
  const lines = String(content || '').split(/\r?\n/);
  const out = [];
  let current = '';
  for (const line of lines) {
    const t = line.trim();
    if (/^\.?(从者行动|御主行动)\s/.test(t)) {
      if (current.trim()) out.push(current.trim());
      current = t.replace(/^\./, '');
    } else if (current) {
      current += '\n' + line;
    } else if (t) {
      current = line;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

// .ra 判定：1d100 <= 目标值算成功，低于目标值一成算"极成功"
function rollRa(target) {
  const roll = Math.floor(Math.random() * 100) + 1;
  const ok = roll <= target;
  return {
    roll,
    ok,
    text: `判定 D100=${roll}/${target} →${ok ? '成功' : '失败'}${roll <= Math.floor(target / 10) ? ' 极成功' : ''}`,
  };
}

// HTML 实体解码（群公告正文常带 &quot; 等转义，与 fate-actions 同款处理）
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

// 从公告对象取正文文本（兼容 message 为对象/字符串、content 字段等形态）
function noticeText(n) {
  const m = n?.message;
  if (m && typeof m === 'object' && m.text != null) return String(m.text);
  if (typeof m === 'string') return m;
  if (n?.content) return String(n.content);
  return '';
}

// 从 OneBot 消息事件提取纯文本（raw_message 优先；message 数组拼 text 段）
function extractText(event) {
  if (typeof event?.raw_message === 'string' && event.raw_message) return event.raw_message;
  const m = event?.message;
  if (typeof m === 'string') return m;
  if (Array.isArray(m)) {
    return m.map(seg => (typeof seg === 'string' ? seg : seg?.type === 'text' ? seg.data?.text ?? '' : '')).join('');
  }
  return '';
}

// 去掉消息开头的 @机器人 段（群聊 @ 机器人发指令时，Koishi 会自动剥，
// 这里等价处理：CQ 码形式 [CQ:at,qq=selfId] 与数组段的 at 都剥掉）
function stripAtBot(text, selfId) {
  if (!selfId) return text;
  return text
    .replace(new RegExp(`\\[CQ:at[^\\]]*qq=${selfId}[^\\]]*\\]\\s*`, 'gi'), '')
    .replace(/^\s*@?机器人\s*/g, '')
    .trim();
}

// ---------- 指令处理器 ----------

/**
 * 创建指令处理器
 * @param {object} deps
 * @param {(action: string, params?: object) => Promise<any>} deps.callOnebot 调 OneBot 动作（wsBot.call）
 * @param {(method: string, path: string, opts?: {query?: object, body?: object}) => Promise<any>} deps.callBackend
 *        调本机后端 HTTP API（等价于原插件调 apiBase）
 * @param {() => string} deps.getSelfId 机器人自身 QQ 号（用来剥离 @机器人）
 * @param {string} deps.transferLogPath 魔力转让台账 JSONL 路径
 */
function createCommandHandler({ callOnebot, callBackend, getSelfId, transferLogPath }) {

  // 查询群名（OneBot get_group_info），查不到返回 null（提示"未知群"）
  async function getGroupName(groupId) {
    try {
      const info = await callOnebot('get_group_info', { group_id: groupId });
      return info?.group_name || null;
    } catch {
      return null;
    }
  }

  // 查询本群绑定的战役 ID；没绑定返回 null
  async function getBoundCampaignId(platform, guildId) {
    try {
      const bound = await callBackend('GET', '/qq-bindings', { query: { platform, guildId } });
      return bound?.campaignId ?? null;
    } catch {
      return null;
    }
  }

  // 提交一条行动（等价于原插件 submitAction：先提交后端，再拼职阶提示文案）
  async function submitAction({ event, campaignId, servantClass, actionType, content }) {
    const { raw, normalized } = normalizeServantClass(servantClass);
    if (!VALID_CLASSES.includes(normalized)) {
      return '无法判断你的职阶。请在职阶群里发送，或在内容开头注明职阶，例如：弓 行动 行动内容';
    }
    const submittedBy = String(event?.sender?.card || event?.sender?.nickname || event?.user_id || 'unknown');
    const classHint = raw === normalized ? normalized : `${raw}（转换为${normalized}）`;

    try {
      await callBackend('POST', '/action-submissions', {
        body: { campaignId, servantClass: normalized, actionType, content, submittedBy },
      });
      return `已提交${actionType === 'SERVANT_ACTION' ? '从者' : '御主'}行动（职阶：${classHint}）`;
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes('没有处于开放状态的回合') || msg.includes('CLOSED')) {
        return '（嗝）当前战役没有开放中的回合，或本回合行动提交已关闭。';
      }
      return `行动提交失败：${msg}`;
    }
  }

  // 自动识别职阶后提交：内容首词是职阶就用首词，否则用群名识别
  async function submitAutoClass({ event, campaignId, content, actionType }) {
    const groupId = event.group_id;
    const groupName = await getGroupName(groupId);
    const clsFromGroup = detectClassFromGroupName(groupName);
    const firstToken = String(content).trim().split(/\s+/)[0] || '';
    const explicit = normalizeServantClass(firstToken);
    // 首词能映射到七个标准职阶（含英文变体如 archer）就算显式职阶。
    // 注意：原插件的判定是 normalized !== firstToken，首词直接写"术/弓"这类
    // 标准字时会被误判成"非职阶"而落到群名识别，这里已修正。
    const hasExplicitClass = VALID_CLASSES.includes(explicit.normalized);
    const servantClass = hasExplicitClass ? firstToken : (clsFromGroup || firstToken);
    const body = hasExplicitClass ? String(content).trim().slice(firstToken.length).trim() : content;
    return submitAction({ event, campaignId, servantClass, actionType, content: body });
  }

  // ---------- 各指令实现（编号对应交付清单） ----------

  const handlers = {
    // .绑定战役 <ID>
    async '绑定战役'(event, args) {
      const campaignId = Number(args);
      if (!Number.isInteger(campaignId) || campaignId <= 0) return '请提供战役 ID，例如：.绑定战役 3';
      const groupId = String(event.group_id);
      try {
        const groupName = await getGroupName(groupId);
        const binding = await callBackend('POST', '/qq-bindings', {
          body: { platform: 'qq', guildId: groupId, campaignId, groupName },
        });
        const name = binding?.campaignName || '（未命名战役）';
        const groupHint = groupName ? `群（${groupName}）` : '本群';
        return `已将${groupHint}绑定到战役 ID=${campaignId}：${name}`;
      } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes('404') || msg.includes('Not Found')) {
          return `未找到 ID 为 ${campaignId} 的战役，请确认 ID 是否正确（战役只能在网页端创建）。`;
        }
        return `查询战役失败：${msg}`;
      }
    },

    // .当前
    async '当前'(event) {
      const groupId = String(event.group_id);
      try {
        const bound = await callBackend('GET', '/qq-bindings', { query: { platform: 'qq', guildId: groupId } });
        if (!bound?.campaignId) return '本群尚未绑定战役。';
        const groupHint = bound.groupName ? `群（${bound.groupName}）` : '本群';
        return `${groupHint}当前绑定：战役 ID=${bound.campaignId}：${bound.campaignName || '（未命名战役）'}`;
      } catch (e) {
        return `查询失败：${String(e?.message || e)}`;
      }
    },

    // .从者行动 / .御主行动（支持多行多条）
    async '从者行动'(event, args) { return submitMulti(event, args, 'SERVANT_ACTION'); },
    async '御主行动'(event, args) { return submitMulti(event, args, 'MASTER_ACTION'); },

    // .潜入：已删除。规则书查证无"潜入"行动（docs/行动规则总表.md 09-07），
    // 它只是旧插件拼"潜入-"前缀的快捷方式，语义未定义，不保留以免误导玩家。

    // .ra <目标值>：1d100 判定
    async 'ra'(event, args) {
      const m = String(args || '').match(/^(\d+)$/);
      if (!m) return '用法：.ra 60（60 为目标成功率）';
      const target = Number(m[1]);
      if (!(target >= 1 && target <= 100)) return '目标值需要在 1-100 之间。';
      const name = String(event?.sender?.card || event?.sender?.nickname || event?.user_id || '');
      const { text } = rollRa(target);
      return `<${name}>${text}`;
    },

    // .转魔 X-Y N：魔力转让申报（追加到 JSONL 台账，GM 事后人工处理）
    async '转魔'(event, args) {
      const m = String(args || '').match(/^\s*([^\s\-－—~～]+)\s*[-－—~～]\s*([^\s\-－—~～]+)\s+(\d+)\s*$/);
      if (!m) {
        return '格式不对，请用：转魔 X-Y N（X 转给 Y，N 为转让魔力点）\n例如：转魔 寻香者-泰然者 30（即转让魔力 30）';
      }
      const [, from, to, amountStr] = m;
      const record = {
        ts: new Date().toISOString(),
        guildId: String(event.group_id),
        user: String(event?.sender?.card || event?.sender?.nickname || event?.user_id || ''),
        from: from.trim(),
        to: to.trim(),
        amount: Number(amountStr),
        content: String(args || '').trim(),
      };
      try {
        mkdirSync(require('node:path').dirname(transferLogPath), { recursive: true });
        appendFileSync(transferLogPath, JSON.stringify(record) + '\n', 'utf8');
      } catch (e) {
        return `记录魔力转让失败：${e?.message || e}`;
      }
      return `已记录魔力转让申报：${record.from} → ${record.to}，${record.amount} 魔力\n（转让后 [圣杯盟约]/[魔力盟约]支持，台账由 GM 事后核对入战斗表）`;
    },

    // .下一时段 / .行动表：原依赖旧机器上的 Excel+python 脚本，已降级
    async '下一时段'() {
      return '该指令依赖旧版 Excel 行动表环境，已停用。时段推进请使用网页端或联系 GM。';
    },
    async '行动表'() {
      return '该指令依赖旧版 Excel 行动表环境，已停用。当前行动请在网页端查看行动面板。';
    },

    // .改群名 <名称>（需要机器人是群主/管理员）
    async '改群名'(event, args) {
      const target = String(args || '').trim();
      if (!target) return '用法：.改群名 新群名（例如：.改群名 弓组 魔力剩余20 结界等级2 战况：平静）';
      try {
        await callOnebot('set_group_name', { group_id: event.group_id, group_name: target });
        return `已尝试群名改为：${target}`;
      } catch (e) {
        return `改群名失败（可能机器人不是群主/管理员，或协议端不支持）：${String(e?.message || e)}`;
      }
    },

    // .发公告 <内容>（需要机器人是群主/管理员）
    async '发公告'(event, args) {
      const target = String(args || '').trim();
      if (!target) return '用法：.发公告 内容';
      try {
        await callOnebot('_send_group_notice', { group_id: event.group_id, content: target });
        return '群公告已发布。';
      } catch (e) {
        return `群公告发布失败（可能机器人不是群主/管理员，或协议端不支持）：${String(e?.message || e)}`;
      }
    },

    // .群公告：读取本群当前公告
    async '群公告'(event) {
      try {
        const notices = await callOnebot('_get_group_notice', { group_id: event.group_id });
        const arr = Array.isArray(notices) ? notices : [];
        if (!arr.length) return '本群当前没有公告。';
        return arr.map((n, i) => {
          const t = decodeEntities(noticeText(n));
          const d = n?.publish_time ? new Date(n.publish_time * 1000).toISOString().slice(0, 16) : '';
          return `${i + 1}. [${d}] ${t || '(无内容)'}`;
        }).join('\n');
      } catch (e) {
        return `读取群公告失败（可能协议端不支持读取公告）：${String(e?.message || e)}`;
      }
    },

    // .确认行动：取本群第一条公告并重发确认格式（配合 GM 在公告里写行动确认）
    async '确认行动'(event) {
      try {
        const notices = await callOnebot('_get_group_notice', { group_id: event.group_id });
        const arr = Array.isArray(notices) ? notices : [];
        let text = '';
        for (const n of arr) {
          text = noticeText(n);
          if (text) break;
        }
        if (!text) return '本群当前没有公告。如需确认行动，请先在公告栏写好行动确认稿。';
        const clean = decodeEntities(text);
        // 东八区时间（原插件同款算法）：UTC + 8 小时后取 MM-DD HH:mm
        const cst = new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(5, 16);
        const confirmText = `? 本回合行动确认 ${cst}\n${clean}`;
        await callOnebot('_send_group_notice', { group_id: event.group_id, content: confirmText });
        return `已读取本群公告并重发确认公告：\n${confirmText}`;
      } catch (e) {
        return `确认失败（可能机器人不是本群群主/管理员）：${String(e?.message || e)}`;
      }
    },

    // .群列表：列出机器人所在的所有群（用于核对私聊/拉群/潜伏/突袭用群号）
    async '群列表'() {
      try {
        const list = await callOnebot('get_group_list');
        if (!Array.isArray(list) || !list.length) return '机器人说当前没有加入任何群。';
        return list.map(g => `${g.group_id}\t${g.group_name || ''}`).join('\n');
      } catch (e) {
        return `获取群列表失败：${String(e?.message || e)}`;
      }
    },

    // .群成员 [群号]：列出群成员（默认本群）
    async '群成员'(event, args) {
      const groupId = (String(args || '').trim()) || event.group_id;
      try {
        const list = await callOnebot('get_group_member_list', { group_id: groupId });
        if (!Array.isArray(list) || !list.length) return '查询结果：群成员列表为空。';
        return list.map(m => {
          const roleTag = m.role === 'owner' ? '群主' : m.role === 'admin' ? '管理员' : '';
          const card = m.card && m.card !== m.nickname ? `(${m.card})` : '';
          return `${m.user_id}\t${m.nickname || ''}${card}${roleTag ? '\t' + roleTag : ''}`;
        }).join('\n');
      } catch (e) {
        return `获取群成员失败：${String(e?.message || e)}`;
      }
    },
  };

  // 从者/御主行动的多行提交：一条消息可写多行"从者行动 A / 御主行动 B"
  async function submitMulti(event, args, defaultType) {
    const campaignId = await getBoundCampaignId('qq', String(event.group_id));
    if (!campaignId) return '本群尚未绑定战役，请 GM 先使用 .绑定战役 战役ID 绑定。';
    if (!args) {
      return '用法：从者行动 行动内容（在职阶群里发送，自动识别行动职阶；支持多行，每行一条）';
    }
    const parts = splitMultiLine(args);
    if (parts.length === 0) return '内容为空。';
    const results = [];
    for (const part of parts) {
      const m = part.match(/^(从者行动|御主行动)\s+([\s\S]+)$/);
      if (m) {
        const type = m[1] === '从者行动' ? 'SERVANT_ACTION' : 'MASTER_ACTION';
        results.push(await submitAutoClass({ event, campaignId, content: m[2].trim(), actionType: type }));
      } else {
        results.push(await submitAutoClass({ event, campaignId, content: part, actionType: defaultType }));
      }
    }
    return results.join('\n');
  }

  // 指令名 -> 帮助文案（.指令 列出全部可用指令）
  const helpText = [
    '可用指令（点号开头，中英文句号均可）：',
    '.绑定战役 <战役ID> - 绑定本群到战役（GM）',
    '.当前 - 查看本群绑定的战役',
    '.从者行动 <内容> - 提交从者行动（职阶群自动识别）',
    '.御主行动 <内容> - 提交御主行动',
    '.ra <目标值> - 1d100 判定',
    '.转魔 X-Y N - 记录魔力转让申报',
    '.发公告 / .群公告 / .确认行动 - 群公告管理（需管理员）',
    '.改群名 <名称> - 修改本群群名（需管理员）',
    '.群列表 / .群成员 [群号] - 查看群信息',
  ].join('\n');

  // 指令别名表：一个处理函数可以挂多个名字
  const aliases = {
    '魔力转让': '转魔',
    '魔法转让': '转魔',
  };

  /**
   * 消息事件总入口：group 消息 -> 解析指令 -> 执行 -> 回复
   * 返回 true 表示识别并处理了指令（供调用方记日志用）
   */
  async function handleEvent(event) {
    if (event?.post_type !== 'message' || event.message_type !== 'group') return false;
    const selfId = getSelfId();
    const raw = extractText(event);
    if (!raw) return false;
    // 剥掉 @机器人 前缀再匹配，等价 Koishi 的指令唤起方式
    const text = stripAtBot(raw, selfId);
    // 指令必须以点号（中英文）开头，普通聊天不进指令流程
    const m = text.match(/^[.。]\s*([^\s]+)\s*([\s\S]*)$/);
    if (!m) return false;

    let name = m[1];
    const args = m[2].trim();
    if (aliases[name]) name = aliases[name];

    if (name === '指令' || name === '帮助' || name === 'help') {
      await replyGroup(event, helpText);
      return true;
    }

    const handler = handlers[name];
    if (!handler) return false;

    try {
      const out = await handler(event, args);
      if (out) await replyGroup(event, out);
    } catch (e) {
      console.error('[onebot] 指令执行失败:', name, e?.message || e);
      try { await replyGroup(event, `指令执行出错：${e?.message || e}`); } catch { /* 回复也失败就只记日志 */ }
    }
    return true;
  }

  // 回复群消息（普通文本）
  async function replyGroup(event, text) {
    await callOnebot('send_group_msg', { group_id: event.group_id, message: String(text) });
  }

  return { handleEvent, helpText };
}

module.exports = {
  createCommandHandler,
  // 以下导出供单元测试使用
  normalizeServantClass,
  detectClassFromGroupName,
  splitMultiLine,
  rollRa,
  stripAtBot,
  extractText,
};
