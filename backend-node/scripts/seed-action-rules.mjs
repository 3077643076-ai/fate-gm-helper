// 行动规则结构化录库：把《行动规则总表》（docs/行动规则总表.md）转成引擎可查询的表
// 用法：node backend-node/scripts/seed-action-rules.mjs
// 幂等：INSERT OR REPLACE（以 action_key 为键，重复执行=更新）
// 维护方式：规则变化时改下面的 ACTION_RULES 数组再重跑；文档与表同源
import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const dbPath = join(root, 'backend-node', 'data', 'gm_helper.db')
if (!existsSync(dbPath)) {
  console.error(`数据库不存在：${dbPath}`)
  process.exit(1)
}
const db = new DatabaseSync(dbPath)

db.exec(`
  CREATE TABLE IF NOT EXISTS action_rules (
    action_key   TEXT PRIMARY KEY,   -- 动词（parser 解析的目标词）
    who          TEXT,               -- all/servant/master/pair(主从同时)/capable(有能力者)
    base_rate    INTEGER,            -- 基础成功率 %；NULL=无判定
    rate_formula TEXT,               -- 动态成功率公式（如 礼装制作=魔力×2%）
    day_bonus    INTEGER DEFAULT 0,  -- 昼间补正
    night_bonus  INTEGER DEFAULT 0,  -- 夜间补正
    costs_action INTEGER DEFAULT 1,  -- 是否消耗行动力
    mana_cost    INTEGER DEFAULT 0,  -- 固定魔力消耗（0=无/见 effect）
    mana_gain    INTEGER DEFAULT 0,  -- 固定魔力供给（0=无/见 effect）
    phase        TEXT NOT NULL,      -- 结算链位置（机动/魂食/干涉/解放/制造/信息/休整/摧毁工房）
    limit_per    TEXT,               -- 频率/条件限制（每轮2次/每阵营1次等）
    effect_text  TEXT,               -- 效果摘要（播报与 AI 参考用）
    source       TEXT,               -- 规则书出处（行号）
    status       TEXT DEFAULT 'confirmed'
  );
`)

// ========== 数据源：《行动规则总表》第二节（GM 已确认口径） ==========
// 字段顺序：key, who, base_rate, rate_formula, day, night, costs, mana_cost, mana_gain, phase, limit_per, effect, source
const ACTION_RULES = [
  ['机动', 'all', null, null, 0, 0, 1, 0, 0, '机动',
   '机动干涉视同干涉',
   '通告全局：暴露出发灵脉与目标灵脉；其他可机动单位获[介入]指令', '规则书 133-143'],

  ['魂食', 'servant', null, null, 0, 0, 1, 0, 60, '魂食',
   '人流>0；宣言"魂食"默认按普通魂食',
   '普通魂食：吃1人流不遮掩（人流-1，+60），公开可知', '规则书 144-161 + GM 09-07'],

  ['魂食遮断', 'servant', 30, null, 0, 20, 1, 0, 60, '魂食',
   '人流>0',
   '掩饰魂食：成功延后曝光（行动阶段结束通告）；失败立即通告。回合末仍在魂食灵脉则人流-1 再+60', '规则书 148-161'],

  ['恶性魂食', 'servant', null, null, 0, 0, 1, 0, 60, '魂食',
   '人流>0；必暴露',
   '当下人流-1+60魔力并通告；回合末若未战斗：人流再-2，供减少值×60（通常+120）', '规则书 162-169'],

  ['无限制魂食', 'servant', null, null, 0, 0, 1, 0, 60, '魂食',
   '人流>0；必暴露',
   '当下人流-1+60并通告；回合末若未战斗：人流与魔力量归0，供减少值×60', '规则书 170-177'],

  ['干涉', 'all', null, null, 0, 0, 1, 0, 0, '干涉',
   '目标=当前以外任一灵脉',
   '默认成功；结束未进驻则返回上一灵脉（战斗失败可能游荡）；目标有其他阵营→交流环节', '规则书 178-189'],

  ['袭击', 'all', null, null, 0, 0, 1, 0, 0, '干涉',
   '每回合已参战者不可再发起',
   '战斗触发：指定目标单位，被袭方至少1单位进战斗位；场上其他单位可选边（满则止）；阵营绑定', '规则书 206-218'],

  ['同灵脉袭击', 'all', null, null, 0, 0, 1, 0, 0, '干涉',
   '回合开始限1次',
   '向同灵脉任一单位宣袭，最优先处理；参战单位本回合无法行动', '规则书 219-222'],

  ['二次袭击', 'all', null, null, 0, 0, 1, 0, 0, '干涉',
   '每阵营限1次；全场参战过+复数阵营',
   '放弃干涉以外行动后宣袭；所有参战单位失去下回合行动', '规则书 231-238'],

  ['进驻', 'all', null, null, 0, 0, 0, 0, 0, '干涉',
   '交流环节；有主灵脉需所有者允许',
   '同灵脉其他阵营无权阻止；驱逐靠敌对行为', '规则书 240-244'],

  ['解放', 'capable', null, null, 0, 0, 1, 0, 0, '解放',
   null,
   '行动阶段内发动/必须行动阶段发动的技能宝具；按 5.2 结算链处理', '规则书 245-248'],

  ['阵地制作', 'capable', null, null, 0, 0, 1, 0, 0, '制造',
   '术从·张角 B级追加宣言×2',
   '礼装/工房/结界的制造总类；礼装制作子项成功率=魔力×2%', '规则书 249-253'],

  ['礼装制作', 'capable', null, '自身[魔力]属性×2%', 0, 0, 1, 0, 0, '制造',
   null,
   '礼装制造（契约之书=基础一次性礼装；魔弹宝石等）；代行者御主可[令咒剥离]', '规则书 249-255'],

  ['广泛侦查', 'servant', 30, null, 20, 0, 1, 0, 0, '信息',
   null,
   '成功→全场从者位置+样貌、结界/工房情报、灵脉人流/魔力量；同灵脉己方御主附其样貌', '规则书 259-265'],

  ['情报调查', 'master', 50, null, 0, 0, 1, 0, 0, '信息',
   '须指定已知样貌的御主',
   '成功→目标所处灵脉/基本资料/能力面板/技能/礼装/学科；同灵脉其他御主一并获得', '规则书 266-274'],

  ['资料分析', 'all', 30, null, 0, 0, 0, 0, 0, '信息',
   '每阵营限1次/目标从者；需已获其至少一个宝具情报',
   '成功→获得目标[技能信息]', '规则书 275-281'],

  ['真名猜测', 'all', null, 'GM 口径：[职阶-真名]匹配；多真名从者任一真名均算', 0, 0, 0, 0, 0, '信息',
   '每阵营限1次/限已遭遇从者/不重复职介',
   '成功→目标基本资料/能力面板/技能/宝具全情报', '规则书 282-289 + GM 09-07'],

  ['休整', 'pair', null, '从者获=御主回路属性（Caster 代御主位则=其基础魔力/2）', 0, 0, 1, 0, 0, '休整',
   '每轮次至多2次；第二次御主判[自身耐久]失败则下回合无法行动',
   '御主与从者双方同时行动', '规则书 290-299'],

  ['协助', 'all', null, '令目标行动检定+20%', 0, 0, 1, 0, 0, '（跟随目标）',
   '目标拒则失败；协助者须持有该行动能力',
   '视为与目标执行同一行动；跨灵脉一同移动；御主协动机动需从者有[骑乘]', '规则书 300-310'],

  ['介入', 'servant', null, null, 0, 0, 1, 0, 0, '（特殊时机）',
   '本回合已介入或已执行同类行动则不可',
   'GM 触发流程：可介入事件→公屏提示→玩家私组提交→本回合行动修改为介入；占行动力且替换之前宣言的行动，行动记录表记为「介入xxx（灵脉）」；视同干涉，最优先处理', '规则书 311-321 + GM 09-07'],

  ['摧毁工房', 'capable', null, null, 0, 0, 1, 0, 0, '摧毁工房',
   null,
   '耗=最大构件规模的魔力摧毁阵地/工房；[轰击]宝具持有者不耗行动但通报全局', '规则书 322-326'],

  // ---- 灵脉限定行动（三国杯说明.md 灵脉条文；结算时机标注 ⚠️ M2 精调） ----
  ['奏乐', 'all', 60, null, 0, 0, 1, 0, 30, '灵脉行动',
   '洛阳限定；每轮次至多 1 次',
   '60%判定：成功+30魔与[乐不思蜀1]（至多3，每层+20%胜率）；出目100改+60与[乐2]；离开洛阳全失', '洛阳灵脉条文 + 灵脉设计范式:89'],

  ['征兵', 'all', 40, null, 0, 0, 1, 30, 0, '灵脉行动',
   '长坂坡限定',
   '成功召2名[曹军]，失败1名（仆役，等级40，除宝具外全属30，主动填战斗位）', '长坂坡灵脉条文'],

  ['托孤', 'all', null, null, 0, 0, 1, 0, 0, '灵脉行动',
   '白帝城限定；每御主每场限1',
   '指定己方一名单位获[遗志]：异地+10等级/+15%胜率，托孤者持白帝城则翻倍；托孤者退场后固定', '白帝城灵脉条文'],
]

// ---------- 写入（幂等） ----------
const insert = db.prepare(`
  INSERT OR REPLACE INTO action_rules
    (action_key, who, base_rate, rate_formula, day_bonus, night_bonus,
     costs_action, mana_cost, mana_gain, phase, limit_per, effect_text, source, status)
  VALUES (@key, @who, @base_rate, @rate_formula, @day, @night,
          @costs, @mana_cost, @mana_gain, @phase, @limit_per, @effect, @source, 'confirmed')
`)

let count = 0
for (const r of ACTION_RULES) {
  insert.run({
    key: r[0], who: r[1], base_rate: r[2], rate_formula: r[3], day: r[4], night: r[5],
    costs: r[6], mana_cost: r[7], mana_gain: r[8], phase: r[9], limit_per: r[10],
    effect: r[11], source: r[12],
  })
  count++
}
console.log(`action_rules 录入完成：${count} 条（幂等重跑=更新）`)

// ---------- 验证：模拟引擎查询 ----------
console.log('\n===== 查询验证（引擎视角） =====')
const demo = db.prepare(`SELECT action_key, base_rate, day_bonus, phase, costs_action FROM action_rules WHERE action_key = ?`).get('广泛侦查')
console.log('查询"广泛侦查":', JSON.stringify(demo))
console.log(`→ 昼间判定值 = ${demo.base_rate} + ${demo.day_bonus} = ${demo.base_rate + demo.day_bonus}%`)

const nightCase = db.prepare(`SELECT action_key, base_rate, night_bonus FROM action_rules WHERE action_key = ?`).get('魂食遮断')
console.log('查询"魂食遮断":', JSON.stringify(nightCase))
console.log(`→ 夜间判定值 = ${nightCase.base_rate} + ${nightCase.night_bonus} = ${nightCase.base_rate + nightCase.night_bonus}%`)

const phases = db.prepare(`SELECT DISTINCT phase FROM action_rules`).all().map(r => r.phase)
console.log('\n结算链阶段覆盖:', phases.join(' / '))
