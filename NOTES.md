# NOTES.md

## 2026-09-07（晚 28）

**战斗流程状态机完成并推送（301e84d）——GM：双跑对比开始**
- battle-state.mjs：五阶段状态机（formation→initial→main→final→done），每步
  API 可操作：createBattle（自动计算表）/setTactics（克制结算）/setMainAttrs
  （主要属性+引擎骰随机属性）/applyCorrection（statBonus 属性补正+四阶段胜率
  修正）/finalize（死斗+决胜 D100+等级魔耗清算）
- battle-router.mjs：/api/engine/battles 七端点
- 修三个 bug：①胜率链双计（面板总计已在三属性对比里，不重复计胜率差；属性补
  正只算技能/战术加成，新增 corrections.statBonus 桶）②corrections 规范化
  （新建战斗 corrections={} 导致 .blue.statBonus 炸）③battle-router 子路由
  路径需带前缀（'/' 匹配不到 /api/engine/battles）
- e2e 实测（术vs枪）：创建→强击vs破袭（克制正确：强击无效）→属性选择→
  属性+30→胜率修正-10→死斗+20→决胜 D100→清算 全绿；数学逐步验算自洽
  （三属性 优优劣=70%基础 → 属性+30=80% → 术-10=85% → 术死斗+20=75% →
  D100=55≤75 枪组胜）
- 双跑对比方法：同一战斗引擎跑一遍（API 序列）+ 战斗表/Excel 跑一遍，逐步对
  胜率链数字；差异=校准点

## 2026-09-07（晚 27）

**实战首战准备：术组 vs 枪组 @许都（第二回合）**
- 张角卡从 _cards dump 补录（id=24，合计 70/20/20/20/90/40/0，Caster；技能/宝具
  待 GM 核对），unit_registry 术从已关联——**双方计算表齐了**
- 枪组魔力补第二回合更正版（吕布 150/150、曹丕 80/110，来自状态记录公告）；
  术组（张角/曹植）无状态记录，魔力不足预查待 GM 提供
- 计算表速览：枪组 等级90/筋力175/耐久135；术组 等级95/筋力27/魔力102——
  枪组筋力碾压（175 vs 27），术组魔力特化型；战术默认演示=强击vs扼守
- battle-prep-sanguo.mjs：战前准备脚本（补卡+计算表+战术+魔力预查）
- 下一场注意：术组公告实锤跨时段写法与"结阵3"口径待确认；枪组吕布宝具/技能
  名单待录（战斗工序能力联动用）

## 2026-09-07（晚 26）

**架构定案：LLM 只做离线丰富，实时链路零 token（d19f638）——GM：token 不够烧**
- 成本对比回应用户：dsh 带团每天 3-4 元；实时 LLM 解析虽便宜（~0.1元/天）但
  仍烧钱；定案=**LLM 离线学别名，带团实时纯规则零 token**
- /api/engine/standardize 改纯规则模式（useLlm 默认 false）；真实公告实证：
  "第一天昼 | 从者：广泛侦查 | 御主 礼装制作 契约之书"→ 两条标准行动单
  （含时点/单位/动词/目标/结算链/判定值）✓
- llm-enrich 工具（离线）：规则解析失败的片段→LLM 产别名建议（白名单约束）→
  人确认 --apply 入库；一次几百 token≈几厘钱
- 别名建模再修正：canonical="动词 目标"复合（parser 拆动词查白名单+目标自动
  填充）；normalizeByAlias action 优先排序；同别名旧行清理；角色前缀空格变体剥离
- 修 bug：parser normalizeLeyline 补 export（router import 崩）
- 标准化输出格式（用户要的"xx（行动时点）xx（机动目标/发动技能）"）：
  `第N天{phase} {单位} {动词} → {目标}（链:xx｜判定x%｜魔力±n｜限制）`

## 2026-09-07（晚 25）

**公告解析增强完成并推送（2bd7919）——GM：公告格式千奇百怪+多动问题**
- 切分器 splitAnnouncement：动次标记（一动/二动/①②）→ 换行 → 序号列表 →
  时段词（白天/晚上，切分后登记当前时段+备注跨时段意向）→ 连接词（然后/再/标点）
  → 片段清理（"先"残留）；切不动整体返回，失败片段进需裁决兜底不丢信息
- 多动登记：engine_actions 去 UNIQUE 加 slot 列（每动一条）；API 返回
  multiAction 提示核对多动权来源
- 别名建模修正：canonical 改"动词 目标"复合格式（搓空花→"解放 虚荣的空中庭院"），
  parser 拆分动词查白名单+目标自动填充；查询 action 优先排序；旧建模（noble）行清理
- 实测：结阵→阵地制作（别名）、"开殿 然后广侦"→两动全解析、"一动：搓空花
  二动：制作制裁机关"→搓空花成功+制裁机关进需裁决（口径未录，正确行为）
- 待录口径：制裁机关（工房构件制作，判定/消耗 GM 定）；跨时段公告的时段分配规则

## 2026-09-07（晚 24）

**公告检查功能完成并推送（c8e5ece）——GM：一键催行动**
- 新增 engine/qqport.mjs：直连 NapCat HTTP（_get_group_notice/_send_group_notice/
  send_group_msg），HTML 实体解码同 fate-actions
- /api/engine 新端点：groups CRUD（群映射，分发版各团自己录）、notices/check
  （遍历私组拉公告：有公告=已交，含"机器人已确认"=已确认，无=未交，逐群容错）、
  notices/remind（向未交组发提醒，默认文案带回合时段）
- 面板右栏新增：公告检查区（NapCat 地址 localStorage 记住 + 检查/催未交按钮 +
  分组状态列表）+ 群映射管理（增删）
- 验证：群映射 CRUD ✓；公告检查错误路径 ✓（无 NapCat 时 fetch failed 进 failed
  数组不炸接口）
- **部署前提**：NapCat 需开启 HTTP Server（如 127.0.0.1:3000）——之前只用 WS
  模式（3001），面板使用前要在 NapCat WebUI 网络配置里开启 HTTP 服务

## 2026-09-07（晚 23）

**分发版 exe 完成并推送（6c9729f）——干净目录终测全绿**
- 分发形态：单个 exe（desktop/SanguoEngine 0.0.0.exe ~110MB）拷到任何目录双击：
  自起后端（7-9 秒）→ /engine 页面（内置前端托管）→ data/ 目录自动生成空库
  （业务表+引擎表+工具表全量自动初始化）→ 战役下拉空=主站 localhost:8100 建新杯
- 三层修复：①main.cjs 改 PORTABLE_EXECUTABLE_DIR/data 数据库（随目录迁移）
  +FATE_FRONTEND_DIST 内置前端环境变量 ②backend-node/db.js 双模式驱动
  （better-sqlite3 ABI 不匹配自动回退 node:sqlite 兼容适配层，覆盖 prepare/exec/
  pragma/transaction；探测必须 new 实例化——dlopen 时才检查 ABI）
  ③engine/router.mjs backendRoot 推导修正（打包目录结构 ≠ 开发目录结构，
  engine 上一级=backend 根，两种结构通用）
- stage-backend.mjs：node_modules 改名 nm_payload 绕过 electron-builder 强排除；
  filter 排除 gm_helper.db（**分发版不带战役数据，防泄密**）
- 空库闭环体验缺口（下轮）：面板加"新建战役"按钮；口径/别名导出导入 API
  （新杯快速套用三国杯验证过的 24 条口径）

## 2026-09-07（晚 22）

**引擎控制台打包成独立 exe 成功（00283a6）**
- 产物：desktop/SanguoEngine 0.0.0.exe（便携版 ~108MB），双击=自起后端（7秒）+
  弹 MAA 风格引擎窗口，关窗自动收后端
- 结构：Electron 壳（frontend/electron/main.cjs）spawn ELECTRON_RUN_AS_NODE 模式
  跑 backend 副本；extraResources 拷 backend-node 整目录（node_modules 改名
  nm_payload 绕过 electron-builder 强制排除，main.cjs 启动前 rename 回来）
- 打包流程：npm --prefix frontend run dist（自动先跑 tools/stage-backend.mjs
  staging：拷 backend-node 排除 backups/test/_cards 等）
- 三个坑：①electron-builder 强排除 node_modules（连改名来源都拦？实际是拦
  目标名 node_modules，staging 改名 nm_payload 即可）②portable 体积 ~108MB
  （Electron+Chromium）③better-sqlite3 走系统 node ABI（ELECTRON_RUN_AS_NODE
  与系统 node 的 modules 版本一致性——本机自用 OK，跨机器分发需 electron rebuild）

## 2026-09-07（晚 21）

**多战役适配完成并推送（b8b376c）——GM：引擎要适配后续的杯子**
- GM 指出面板标题写死"三国杯"→ 全链路清查硬编码：
  ①parser.mjs normalizeLeyline 写死 campaign_id=999002（真 bug，别的战役解析
  不了灵脉目标）→ 参数化
  ②router.mjs 四处默认 999002 → campaignId 必传校验（requireCampaignId，
  绝不默认到某个杯）
  ③EnginePanel 加战役下拉（/api/campaigns）+ 动态标题 + localStorage 记住选择
- 验证：切"测试杯"标题跟随；后端重启后 status/rulings/tickets 全 200
- 原则沉淀：引擎=多战役通用代码，某杯的数据（灵脉/口径/别名/群映射）全走
  配置和录入，一个硬编码都不留

## 2026-09-07（晚 20）

**引擎控制台面板完成（MAA 风格深色独立窗口）**
- frontend/src/views/EnginePanel.vue：深色作战台（底#121317/面板#1b1d24/强调橙
  #ff8a2a/切角 clip-path 元素），三栏（结算链导航+行动登记+需裁决/判定单/待办）
  +底部引擎日志；对接 /api/engine 七端点；/engine 路由；App.vue 对 /engine 隐藏
  NavBar/footer
- start-engine.bat：构建 → 后端 → Edge --app 模式独立窗口（1280×860），
  用户诉求"MAA 那种桌面程序"=网页技术+app 壳，无需 Electron
- frontend 补装 xlsx（package.json 声明了但 node_modules 没装，构建曾失败）
- 端到端验证：面板登记"广泛侦查"→引擎入库→UI 分组显示→日志反馈，闭环 OK
- 灵脉效果架构确认（GM：每把都不一样）→ 效果类型驱动：引擎内置效果类型结算器
  （供魔/人流/判定 buff/属性补正/拦截/专属行动），灵脉配置=效果类型+参数数据，
  换团录数据不改代码——写进引擎规格待办

## 2026-09-07（晚 19）

**M3 战斗引擎核心完成并推送（68a6fa4）——GM 优先级调整：战斗>自动拉群**
- 战斗结算规格 v0.1（docs/战斗结算规格.md）：五阶段状态机/战斗位与宽度/胜率链/
  结算链五级排序/FP 撤退/游荡，三源合一（规则书战斗章+battle-sheet 六大清单+
  前端 useBattleCalculator 移植）
- 魔力不足惩罚定稿：**规则书线性口径**（每-20=全属性-10，下限5），Excel 档位表
  废弃；引擎算建议值、GM 可手填覆盖（实际惯例是 GM 手填）
- 可选规则默认不启用：差值减半（双从者主力时胜率差距减半）、放弃追击（初始工序
  结束免等级魔耗）——开团配置可开
- battle.mjs 核心：calcSideStats（编队属性，辅助/仆役减半、支援不计）/
  applyTactics（克制环 强击>破袭>试探>扼守，被克制无效）/calcWinRate（三属性
  对抗→基础胜率→等级差→属性差→双向抵消至100→保底 clamp）/finalJudge/
  afterBattleLedger（等级魔耗）
- 离线回放通过：吕布+曹丕 vs 魏延+刘协，强击克扼守（黄无效）、三属性 优劣劣=
  基础50%、蓝110 vs 黄30→胜率90%、D100=45 蓝胜、清算 吕布-35/魏延-40/刘协-25
- M3 剩余：engine_battles 表+工序状态机（交互式工序提交）+技能联动（M2 模板库）+
  QQ 接线

## 2026-09-07（晚 18）

**M1 完成并推送（31457ad）：引擎 API 端到端测试全绿**
- 新增 backend-node/engine/ 六件套：store（5 表）/parser（别名归一+白名单）/
  settler（前置检查→结算链→落账→对账）/router（/api/engine 七端点）/
  replay-day1（离线回放）/e2e-test（API 全流程测试）
- unit_registry 14 单位映射（6 缺卡标注）；settler 休整改精确查卡
- 踩坑记录：①SPA fallback 的 app.get('*') 会吞先注册的异步路由的 GET——
  解法=同步占位 router + 异步 use 挂真路由；②类别名和子项名都要有 action_key
  （阵地制作 vs 礼装制作）；③中点字符变体（·/・）让 SQL 精确匹配失败，用 LIKE
- M1 验收：离线回放（奏乐判定单+30/机动位置+拉群待办/魂食人流+60/缺卡待办
  路径/效果类 deferred）+ API 端到端（解析失败→需裁决→拦截推进→裁决→重推）
  全绿
- M1 剩余：fate-actions 恢复 + .推进/.裁决/.状态 三指令（需插件从备份恢复）
- M2 待办：11 灵脉效果全录、技能模板联动（效果类行动转正）、遮断判定细则、
  unit→player 播报映射

## 2026-09-07（晚 17）

**M1 引擎骨架 + 离线回放跑通**
- 新增 backend-node/engine/：store.mjs（5 张引擎表）/parser.mjs（指令解析+别名
  归一+白名单校验）/settler.mjs（前置检查→结算链调度→结算→落账→对账）
  /replay-day1.mjs（离线回放，自带清理）
- action_rules 补录：阵地制作（seed 漏录教训：类别名和子项名都要有 key）+ 奏乐/
  征兵/托孤三条灵脉行动；别名"奏乐/乐不思蜀"canonical 对齐"奏乐"（中点字符
  变体坑：SQL 精确匹配失败用 LIKE）
- 回放验证通过：奏乐判定单驱动+30魔+乐不思蜀 buff 入场 ✓；机动位置变更+GM
  拉群待办 ✓；魂食人流-1+60 ✓；休整御主卡缺失走待办路径 ✓；效果类 deferred ✓；
  前置检查拦未挂点判定单 ✓（解析失败→需裁决→推进被拦，机制正确）
- 已知限制（M2 处理）：①休整找御主卡用 class_name LIKE 职阶——御主卡 class_name
  是"体术宗师"类职业名匹配不到，需 unit_registry（unit_key→code 映射表，数据
  本地脚本灌入）；②遮断判定细则；③回放脚本对账展示的合并逻辑小 bug（数据无错）
- 下一步：unit_registry + /api/engine/* 路由 + fate-actions 三指令 + QQ 接线

## 2026-09-07（晚 16）

**结构化录库完成 + 介入口径修正**
- action_rules 表建成（20 条行动规则，seed 脚本 backend-node/scripts/seed-action-rules.mjs
  幂等可重跑）；引擎消费模式=解析动词→查表→按表结算（数据驱动，改规则不改代码）
- 关键字段：base_rate(NULL=无判定)/rate_formula(动态公式)/day_night_bonus/
  costs_action/phase(结算链)/limit_per
- 介入口径修正（GM 09-07）：**占行动力**且**替换之前宣言的行动**，行动记录表
  记为「介入xxx（灵脉）」；costs_action 0→1 已改，总表同步
- costs_action=0 的行动仅：进驻/资料分析/真名猜测

## 2026-09-07（晚 15）

**M0.5 行动规则总表完成（docs/行动规则总表.md），口径全部确认**
- 规则书 2/3/4/5 章通读：19 行动类别全明文（判定值/消耗/时机/结算链位置+行号出处）
- 魂食四变体定稿：普通魂食（宣言"魂食"默认，吃1人流不遮掩）/遮断 30%/恶性/无限制
- 圣杯规模定稿：从者退场+1、御主每2名+1、达6终局；圣杯供魔=当前规模×10 动态
- 乐不思蜀定稿：洛阳奏乐专属 buff（成功+1 至多3，出目100+2），非通用层数
- 潜入定稿：规则书无此行动（fate-actions 快捷指令，语义未定义），引擎第一版不收录
- 休整第二判定定稿：规则书 3.6，按字面执行（御主下回合行动冻结）
- 真名猜测定稿：GM 口径[职阶-真名]匹配，多真名从者（丑御前=源赖光）任一真名均算
- 介入定稿：可介入时公屏提示 → 玩家私组提交 → 行动修改为介入
- 战斗结算知识盘点：battle-sheet-xlsx 技能（备份 zip）已文档化 Excel 六大判定清单；
  M3 前置=汇总规则书战斗章+六大清单+前端公式出战斗规格，等第一场实战校准
- 引擎 M1 前置全部就绪：下一步 action_rules 表结构化录库 → parser/settler/judge

## 2026-09-07（晚 14）

**测试复盘工具链就绪（已推送 91032d4）**
- node tools/collect-test-log.mjs：一键收集复盘素材到 logs/test-log-<时间>/
  （dsh 会话 zstd + 群聊 jsonl + mana_ledger/判定单/别名/口径/卡/灵脉 JSON
  导出 + SOP/NOTES 快照），跑完右键压缩即可带来。
- node tools/toggle-fate-plugin.mjs on|off|status：插件一键启停
  （操作 cordis.patch.yml 的 insert 块，带 .bak-toggle 备份，重启 dsh 生效）。
- 教训：ESM 语法别配 .cjs 扩展名。

## 2026-09-07（晚 13）

**已推送 GitHub（b7d2a72），晚上带团实测**
- 提交 12 文件 1632 行：插件全套 + 带团SOP v0.3 + 导入脚本 + 灵脉设计范式.md
  + NOTES + .gitignore 追加。
- 保密拦截：setup-sanguo.mjs（灵脉全文/供魔数据/玩家映射）、新三杯子/、备份
  zip、.dsh-meow/、卡面 dump、根 scripts/ 全部 gitignore；待提交文件过了
  玩家昵称/QQ/群号敏感词扫描，全部干净。
- gitignore 教训：无前导斜杠的 `scripts/` 匹配任意层级，改 `/scripts/` 锚定根。
- 晚上测试要点：dsh 新会话说"开带团模式" → gm 工具上线+铁律注入；验查卡
  （吕布/魏延）、搜规则（奏乐）、记账对账、判定单挂点。

## 2026-09-07（晚 12）

**挂载联调成功，dsh 已带插件运行**
- 挂载踩坑记录：①patch 条目是"修改已有 entry"，新增必须用 `- insert:` 语法
  （无 id 的 insert 才是顶层插入）；②绝对路径 name 不被识别，junction 到
  profile node_modules + 包名解析 OK；③插件必须 `export const inject = ['tools']`；
  ④工具必须声明 output { schema, render }。
- boot 阶段插件失败会拖垮整个 dsh 启动（教训：插件改动后先 --dump-config
  预检 + 用日志重启验证）。
- PowerShell 5.1 Get-Content/Set-Content 会用 GBK 毁坏 UTF-8 中文文件
  （教训：改代码文件只用编辑工具，不用 PS 读写）。
- A1 完成：三国杯战役 id=999002（私组绑定正好指向它，无需改绑）、11 灵脉、
  52 别名、9 口径规则、10 行动模板、9/13 卡入库。
- 卡缺口（待 GM 补）：司马师(弓从)、火焰驹(弓御)、荀彧(剑御) 无文件；
  张角(术从)、左慈(杀御)、阿斗/刘禅(狂御) xlsx 文件损坏。
  多导入：赤兔（名单外，可能备用）。
- gm_ticket 判定单已实装（create/list/attach/void + 会话隔离 + 最早投点锁定）。
- dsh web 已重启并加载插件（console 仅 volcark-quota 的 400，与插件无关）。
- 后端 node backend-node/index.js 已在 8100 运行（会话激活/账号管理等网页功能
  需要它；纯 dsh 插件功能不依赖）。

## 2026-09-07（晚 11）

**fate-gm-tools 插件骨架建成 + 冒烟测试通过**
- 新增 tools/fate-gm-tools/：index.mjs（gm_mode 开关 + 五工具注册 + 会话级
  铁律注入）+ lib/store|lookup|search|ledger.mjs。
- 零 npm 依赖：SQLite 用 Node 24 内置 node:sqlite（插件目录无需 node_modules）。
- 会话激活：activatedSessions Set（进程内，重启即清）；system-prompt/assemble
  瀑布只对激活会话追加 { name:'fate-gm-rules', text:铁律 } 段落。
- 业务工具：查卡/搜规则/记账/结算已真实可用；gm_ticket（判定单）v0.1 占位。
- 冒烟测试通过：搜"魔境的智慧"直接命中扩充包原文（消耗魔力30/随时/荣冠）；
  账本记汇清闭环 OK。
- 待办：判定单实装（A2）；悬浮窗 client 半区（二期，槽位 shell.overlay 已确认
  存在，注册模式参考 plugin-manager 的 ctx.slots.inject + slots.register）；
  挂载联调（cordis.patch.yml 加条目，绝对路径 entry，需重启 dsh + --dump-config
  预检）。

## 2026-09-07（晚 10）

**开关作用域升级：会话级（GM 指出全局开关有忘关污染隐患）**
- 从"全局休眠-激活"改为"会话级激活"：只有说了"开带团模式"的那个会话
  挂工具+注入铁律，其他会话零影响。
- 技术依据（tool-bootstrap.mjs 原文注释）：`agent.ctx.tools` 是 per-agent
  view of the host registry，"the switch affects this session only"——
  dsh 官方模式（PTC 切换即按会话）。assemble 瀑布的 context.agent 可定位
  当前 session，按 session 标志决定是否注入铁律。
- 常驻残留仅 gm_mode 开关工具本身（全局工具表，几十 token）。
- 会话激活态不跨 dsh 重启（故意设计，防状态残留），重启后重新说一句即可。

## 2026-09-07（晚 9）

**插件开关改为"休眠-激活"式（GM 要一句话激活，弃用 --patch 启停）**
- 插件常挂（patch 写进 cordis.patch.yml，启动命令不变），但默认休眠：
  只注册 1 个 gm_mode 开关工具（几十 token，description 写明触发词）。
- 说"开带团模式" → gm_mode(on)：注册全部工具 + system-prompt 注入铁律，
  状态写本地文件（重启保持）；"关带团模式" → gm_mode(off)：注销/休眠。
- 可行性：system-prompt/assemble 每次请求都跑（tool-bootstrap.mjs 证实），
  热切换下一轮生效；ctx.tools 动态变更支持（presentAs 返回 disposer 模式），
  若动态注销有出入则退化为"工具常驻+休眠时 execute 返回未激活"。
- 基础体验影响 ≈ 一个常驻开关工具的 token。
- 网页 UI 按钮：dsh client-ui 插件体系存在（profile 里有 plugin-manager 等
  UI 插件），留二期。

## 2026-09-07（晚 8）

**插件启停方案定案（GM 担心影响日常使用）**
- 结论：插件不做 dsh plugin add，不进 web profile 的 bundles/node_modules。
- 挂载方式：项目内放 fate-gm-tools/（源码）+ fate-on.cordis.yml（patch 文件，
  entry 用本地路径，参考 .agent-presets/liangshen/agent.cordis.yml 语法）。
- 平时：照常 dsh web，插件完全不存在（零影响）。
- 带团：带团模式.bat = start-local.bat + dsh web --patch fate-on.cordis.yml。
- patch entry 语法验证自 agent.cordis.yml：- id/name(本地路径或包名)/config/
  disabled（支持 !!js 条件表达式）。
- 铁律注入用插件内 system-prompt/assemble 追加段落（不用 persona 配置行，
  那会覆盖默认人格——实施时验证）。

## 2026-09-07（晚 7）

**轨 A 实现形态定案（GM 批准做 dsh 插件）**
- 关键发现：dsh 是 cordis 架构（~/.dsh/profiles/web/cordis.yml），插件= cordis
  npm 包挂 bundles——与 Koishi/fate-actions 同框架，开发经验直接复用。
- 工具注册 API：ctx.tools.register({name, description, parameters, execute})
  ——现成范例在 ~/.dsh/.agent-presets/liangshen/custom-bash.mjs。
- 常驻铁律挂载点：ctx.on('system-prompt/assemble') 瀑布注入（同范例
  tool-bootstrap.mjs 演示了改系统提示的写法）。
- 计划新建 fate-gm-tools 插件（cordis npm 包）：
  工具=查卡/搜规则/记账/结算/判定单；系统提示注入=铁律四条+SOP 摘要；
  核心逻辑独立成 node 模块供轨 B 引擎复用。
- skill 降为备用（核心逻辑是独立模块，换 agent 环境脚本照用）。

## 2026-09-07（晚 6）

**卡与规则书的分工（GM 定调，查证模型重构）**
- GM 原则：玩家角色卡可能与规则版本不一致或填写有误 → **魔力消耗/回转/具体效果
  一律以规则书/资源库为准，角色卡只提供"有什么技能的名字"**。
- SOP 3.2 查证从线性五级改为按问题类型路由：
  名字归属→查卡；数值效果→规则书（卡面冲突时按规则书+登记差异提醒 GM）；
  规则书查无（自创）→卡面参考+GM 确认后录技能模板库；GM 特裁→覆盖一切；
  场上状态/团配置→涉及即查。
- 查卡脚本输出形态改为"能力名清单"（附录 B 同步）。
- 与项目既有 skill_template 设计（结构层+原文层）完全对上：卡技能名匹配模板，
  模板数值来自规则书——A1 录模板时把常用技能权威数值录进去即可闭环。

## 2026-09-07（晚 5）

**查证性能与向量化问题（GM 问：五级都查会不会慢）**
- 结论：不慢。①~④ 全是 SQLite 结构化查询（<1ms 级），⑤规则库约几百 chunk
  LIKE/FTS 扫描几十 ms，全程 <0.1s；且五级是短路设计（判例命中即停），
  非每次全查。耗时大头是 LLM 生成（秒级）。
- 向量化管语义匹配（描述性查询），带团查证 95% 是按名查（别名已归一化），
  关键词够用。优先做：把闲置的 kb_chunk_fts（FTS5 表已建未写入）接入
  build-kb，白捡提速；向量检索留作以后增强（需 embedding API，多依赖）。
- 行动项：A2 做搜规则脚本时接 FTS5。

## 2026-09-07（晚 4）

**查证源优先级明确化（GM 问：查证是否含玩家角色卡）**
- 回答：含。SOP 3.2 查证步骤升级为五级优先：①判例记录（GM 特裁最优先，
  可覆盖规则书原文）→ ②玩家角色卡（本团事实，自创技能只在卡上）→
  ③场上状态库（生效结界/buff/契约，教训：张角回魔误判实为阵地额魔池）→
  ④团配置层（灵脉规则/口径表）→ ⑤规则书/资源库（knowledge/）。
- 全部查不到 → 需裁决。查证输出带出处落盘。

## 2026-09-07（晚 3）

**投点取点与宽免口径（GM 口述，SOP 3.4b 第 6 条）**
- 取点：以最早的确定投点为准，锁定后后续投点忽略（防刷骰），重投需 GM 同意。
- 忘昼夜补正投错目标值（例：忘了昼补正投 ra30 广泛、忘了夜回合投 ra60）：
  出目按正确口径重判——重判过 → 直接算过不重投（GM 惯例从宽，玩家常说
  "就算这个得了"）；重判不过 → **默认从宽但附带警告**（GM 确认的口径），
  处理+警告记判例留痕。

## 2026-09-07（晚 2）

**投点问题（GM 第二个痛点，SOP 升 v0.3）**
- 问题：玩家乱投骰（想投就投）；主从各需投骰时 AI 误判归属——09-04 广侦情报
  误发骑组，侥幸杀-骑结盟不撤回，否则信息泄露。
- 解法=投点登记制（SOP 3.4b）：先立判定单（编号/角色/行动/目标值/所属组）→
  投点必须挂单，同组多单必须回执确认归属（禁按顺序猜）→ 无单骰子=无效投点
  自动忽略 → 判定结果只发声明组，情报类严禁跨组。
- GM 补充：魔力人工也经常算错 → 佐证口径表必须脚本算（3.3.1）。
- 判定单将作为工具脚本（附录 B）+ 轨 B 引擎表结构（judgment_ticket）。

## 2026-09-07（晚）

**SOP 复盘验证（GM 提问：用 SOP 能否发现第一天的问题）**
- 从备份 zip 挖到关键素材：《三国杯结算记录-第1天.md》（第一天完整问题清单）、
  618KB 完整群聊（覆盖 09-04/09-06 结算现场）、《术语别名映射.md》（09-04 已建，
  含昵称映射+自证法）、09-04 行动表备份、结算链顺序判例。
- 结论：11 个实际问题 SOP v0.1 覆盖 7 个；v0.2 补 4 个盲区：
  ①魔力口径表（公式进库脚本算，AI 禁口算）②结算前置检查（需裁决清空+口径冻结，
  防结算中回滚——09-04 真实发生"结算全部回退"）③行动可见性（GM 纠正：魂食默认
  结算后发公屏没错，事故根因是忽略了场上[魔术结界：鲜血神殿]"隐藏遮蔽魂食信息"
  的宝具效果——可见性=行动类型×场上状态，播报前必须查证场上宝具/结界）
  ④结算后固定动作清单（名片/群名刷新、公告去重）。
- SOP 已升 v0.2（docs/带团SOP.md），附录 D 是逐条对照表。
- 重要规则资产：结算链顺序=机动→魂食→干涉→解放→制造→信息→休整→摧毁工房
  （轨 B 引擎核心规则，顺序影响结果）。
- 鲜血神殿全称=他者封印·鲜血神殿（狂从魏延结界宝具，解放不耗行动为 GM 特裁）。
- 别名注册表初始数据改用现成《术语别名映射.md》导入，白捡。

## 2026-09-07

**仓库状态**
- 从 GitHub 更新到 54dfc39（保密清理）。pull 连带删除了本地 fate-actions 插件源码、tools/napcat、三国杯文档、判例.md 等；备份包 fate-三国杯-备份-20260906-2140.zip 内含完整旧版（会话记录 zstd 是空壳只有会话头）。
- 本机 koishi.yml 仍声明 fate-actions 且 apiBase 指向旧端口 8080（应为 8100），恢复插件时一并修。

**产品方向（与 GM 对齐）**
- 网页版战斗表实际带团不好用；当前用 dsh（DeepSeek Harness，npm 装，profile 架构）带团，公告流为主。
- 痛点：AI 凭上下文记忆干活，会忘规则/角色卡（案例：忘狂阶宝具、魂食发错、第一天魔力结算丢信息算错）。
- 定案：两轨并行。轨 A = dsh 带团加固（SOP + 工具 + 关卡）；轨 B = YGO 式行动引擎 MVP（SOP 跑稳后逐时段接管）。玩家指令用自然语言+需裁决兜底；GM 手动推进。

**轨 A 关键设计**
- 分工：流程=docs/带团SOP.md（主干）；工具=查卡/搜规则/记账/结算脚本（让流程每步是真动作）；监工=发送关卡代理（伪装 NapCat，程序级强制）。
- 关卡分级：私组直通不校验；灵脉群/公屏严格校验（实体字典：精确→拼音→编辑距离），不匹配拦截留痕。
- 别名注册表回退链：精确→别名→拼音→编辑距离→团内类型推理（泛用指代：团内唯一"神殿"=鲜血神殿）→AI 语境猜→需裁决；别名带唯一性复查防漂移。
- 别名生长：预置（咖喱棒=弓）/自动（拼音）/教学（裁决即录入）/挖掘（群聊 jsonl 高频未识别词批量确认）。
- 魔力账本：每笔变动立即入库（角色/回合/时段/±数/事由/来源），结算=账本 SUM 对账，AI 只抽取和播报不心算。案例教训：第一天魔力丢失信息。
- 常驻铁律进 dsh 常驻配置（.agent-presets 或 profile patch，格式待摸）：状态只信库、引用必查证、出群必走关卡。

**log 复核结论（群聊记录 929 条，08-29~09-03）**
- 公告=行动可靠源，私组 RP 闲聊大量混流，不作为行动依据。
- "广泛"=收集情报类行动黑话（枪组实聊）；乐不思蜀=洛阳奏乐 buff 代指。
- log 只到 09-03，魔力出错现场未覆盖；鲜血神殿不初始 11 灵脉内，是开团后新增（待 GM 口述）。
- 三国杯说明.md（git 历史 a19583a 可恢复）含 11 灵脉全文+24 群映射+行动约定，是 A1 数据初始化主素材。

**下一步待办**
1. GM 过目 docs/带团SOP.md v0.1 → 修订定稿
2. GM 口述补充：鲜血神殿详情、新增灵脉/地点、外号表删改、"广泛"的规则界定
3. 问 dsh：NapCat 接口基地址/调用方式（关卡代理配置用）
4. A1 数据初始化（恢复三国杯说明.md → 建"三国杯"战役、导卡、灵脉、别名表）
5. A2/A2.5 工具脚本 → A3 关卡 → A4 常驻配置 → 实战验证一个时段

## 2026-09-08

**独立战斗表页面完成并推送（293ab02）——GM：要专门页面+和 Excel 战斗表相同+玩家核对**
- frontend/src/views/EngineBattleSheet.vue（/engine-battle/:battleId?）：复刻 Excel
  战斗表结构（其他 GM 零适应）：一、战斗计算表（编队/七维对比/战术行）→ 二、
  属性对抗（优平劣+计分+基础胜率）→ 三、胜率链（基础/等级差/属性补正/累计/实际
  含保底标注）→ 四、能力发动申报（藏拙=不申报不计入）→ 五、死斗+决胜+清算
- 操作按阶段渲染；表格化 Excel 观感，深色主题统一；playwright 手动全流程验证通过
- EnginePanel 战斗区加"打开完整战斗表"链接
