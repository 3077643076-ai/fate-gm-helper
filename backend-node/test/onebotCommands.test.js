// onebot 指令模块单测：纯函数 + 带 mock 的指令分发集成测试
// 运行：node test/onebotCommands.test.js

const assert = require('assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createCommandHandler,
  normalizeServantClass,
  detectClassFromGroupName,
  splitMultiLine,
  rollRa,
  stripAtBot,
  extractText,
} = require('../lib/onebot/commands');

// ---------- 纯函数 ----------

// 职阶归一化
assert.deepStrictEqual(normalizeServantClass('archer'), { raw: 'archer', normalized: '弓' });
assert.deepStrictEqual(normalizeServantClass('枪'), { raw: '枪', normalized: '枪' });
assert.deepStrictEqual(normalizeServantClass('Berserker'), { raw: 'Berserker', normalized: '狂' });
assert.deepStrictEqual(normalizeServantClass('??'), { raw: '??', normalized: '??' });

// 群名职阶识别
assert.strictEqual(detectClassFromGroupName('弓组-降临灵脉B'), '弓');
assert.strictEqual(detectClassFromGroupName('闲聊群'), null);
assert.strictEqual(detectClassFromGroupName(''), null);

// 多行行动拆分：混合 . 前缀、续行内容
assert.deepStrictEqual(
  splitMultiLine('从者行动 机动-灵脉B\n继续环绕侦查\n.御主行动 魂食-灵脉A'),
  ['从者行动 机动-灵脉B\n继续环绕侦查', '御主行动 魂食-灵脉A'],
);
assert.deepStrictEqual(splitMultiLine('从者行动 降临-灵脉C'), ['从者行动 降临-灵脉C']);
assert.deepStrictEqual(splitMultiLine(''), []);

// .ra 边界：目标 100 必成功
const raHundred = rollRa(100);
assert.strictEqual(raHundred.roll >= 1 && raHundred.roll <= 100, true);
assert.strictEqual(raHundred.ok, true);

// @机器人剥离
assert.strictEqual(stripAtBot('[CQ:at,qq=715218931] .ra 60', '715218931'), '.ra 60');
assert.strictEqual(stripAtBot('.ra 60', '715218931'), '.ra 60');

// 消息文本提取：raw_message 优先；数组段拼 text
assert.strictEqual(extractText({ raw_message: '.当前' }), '.当前');
assert.strictEqual(
  extractText({ message: [{ type: 'at', data: { qq: '1' } }, { type: 'text', data: { text: ' .当前' } }] }),
  ' .当前',
);

// ---------- 指令分发（mock OneBot 调用和后端 HTTP） ----------

// 临时台账文件：测 .转魔 的 JSONL 落盘
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onebot-test-'));
const transferLogPath = path.join(tmpDir, 'magic-transfers.jsonl');

// mock：记录 OneBot 动作调用；回复消息通过 send_group_msg 捕获
const onebotCalls = [];
function mockCallOnebot(action, params = {}) {
  onebotCalls.push({ action, params });
  // 群名/公告/成员等查询返回固定样例
  if (action === 'get_group_info') return { group_name: '弓组-降临灵脉B' };
  if (action === '_get_group_notice') return [];
  if (action === 'get_group_list') return [{ group_id: 111, group_name: '弓组' }];
  return { retcode: 0 };
}

// mock：记录后端 HTTP 调用，按路径返回样例
const backendCalls = [];
function mockCallBackend(method, path, opts = {}) {
  backendCalls.push({ method, path, opts });
  if (path === '/qq-bindings' && method === 'POST') {
    return { campaignId: opts.body.campaignId, campaignName: '测试战役' };
  }
  if (path === '/qq-bindings' && method === 'GET') {
    return { campaignId: 3, campaignName: '测试战役', groupName: '弓组' };
  }
  if (path === '/action-submissions') return { id: 1 };
  throw new Error(`unexpected ${method} ${path}`);
}

const handler = createCommandHandler({
  callOnebot: mockCallOnebot,
  callBackend: mockCallBackend,
  getSelfId: () => '715218931',
  transferLogPath,
});

// 构造一条群消息事件
function groupEvent(text) {
  return {
    post_type: 'message',
    message_type: 'group',
    group_id: 111,
    user_id: 222,
    self_id: 715218931,
    raw_message: text,
    sender: { card: '测试玩家', nickname: '测试玩家' },
  };
}

(async () => {
  // 普通聊天不进指令流程
  assert.strictEqual(await handler.handleEvent(groupEvent('大家好')), false);

  // .ra：回复判定结果
  assert.strictEqual(await handler.handleEvent(groupEvent('.ra 60')), true);
  assert.strictEqual(onebotCalls.at(-1).action, 'send_group_msg');
  assert.match(onebotCalls.at(-1).params.message, /判定 D100=\d+\/60 →/);

  // @机器人 + 中文句号也能唤起指令
  assert.strictEqual(await handler.handleEvent(groupEvent('[CQ:at,qq=715218931] 。ra 50')), true);

  // .指令：回复帮助文案
  await handler.handleEvent(groupEvent('.指令'));
  assert.match(onebotCalls.at(-1).params.message, /可用指令/);

  // .绑定战役：走后端 POST，回复带战役名
  await handler.handleEvent(groupEvent('.绑定战役 3'));
  assert.strictEqual(backendCalls.at(-1).method, 'POST');
  assert.strictEqual(backendCalls.at(-1).path, '/qq-bindings');
  assert.match(onebotCalls.at(-1).params.message, /已将.*绑定到战役 ID=3：测试战役/);

  // .当前：走后端 GET
  await handler.handleEvent(groupEvent('.当前'));
  assert.strictEqual(backendCalls.at(-1).method, 'GET');
  assert.match(onebotCalls.at(-1).params.message, /当前绑定：战役 ID=3/);

  // .从者行动：群名"弓组"自动识别职阶为弓，走后端提交
  await handler.handleEvent(groupEvent('.从者行动 机动-灵脉B'));
  const submission = backendCalls.at(-1);
  assert.strictEqual(submission.path, '/action-submissions');
  assert.strictEqual(submission.opts.body.servantClass, '弓');
  assert.strictEqual(submission.opts.body.actionType, 'SERVANT_ACTION');
  assert.strictEqual(submission.opts.body.content, '机动-灵脉B');
  assert.match(onebotCalls.at(-1).params.message, /已提交从者行动/);

  // .御主行动：内容首词职阶优先于群名
  await handler.handleEvent(groupEvent('.御主行动 术 魂食-灵脉A'));
  assert.strictEqual(backendCalls.at(-1).opts.body.servantClass, '术');
  assert.strictEqual(backendCalls.at(-1).opts.body.actionType, 'MASTER_ACTION');

  // 未绑定战役的群提交行动 -> 提示绑定
  const unboundHandler = createCommandHandler({
    callOnebot: mockCallOnebot,
    callBackend: (method, path, opts = {}) => {
      if (path === '/qq-bindings' && method === 'GET') return null;
      throw new Error(`unexpected ${method} ${path}`);
    },
    getSelfId: () => '715218931',
    transferLogPath,
  });
  await unboundHandler.handleEvent(groupEvent('.从者行动 机动'));
  assert.match(onebotCalls.at(-1).params.message, /尚未绑定战役/);

  // .转魔：写 JSONL 台账并回复确认
  await handler.handleEvent(groupEvent('.转魔 寻香者-泰然者 30'));
  const lines = fs.readFileSync(transferLogPath, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 1);
  const record = JSON.parse(lines[0]);
  assert.strictEqual(record.from, '寻香者');
  assert.strictEqual(record.to, '泰然者');
  assert.strictEqual(record.amount, 30);
  assert.match(onebotCalls.at(-1).params.message, /已记录魔力转让申报/);

  // 行动提交报错（无开放回合）时的友好文案
  const closedHandler = createCommandHandler({
    callOnebot: mockCallOnebot,
    callBackend: (method, path) => {
      if (path === '/qq-bindings' && method === 'GET') return { campaignId: 3 };
      throw new Error('没有处于开放状态的回合，或本回合行动提交已关闭');
    },
    getSelfId: () => '715218931',
    transferLogPath,
  });
  await closedHandler.handleEvent(groupEvent('.从者行动 机动'));
  assert.match(onebotCalls.at(-1).params.message, /没有开放中的回合/);

  // 清理临时目录
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log('onebot 指令模块测试通过');
})().catch((e) => {
  console.error('测试失败:', e);
  process.exit(1);
});
