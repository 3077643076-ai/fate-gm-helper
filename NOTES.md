# NOTES.md

## 2026-09-16（夜 6）

**修"AI 代收失败：roundPhase is not defined"**
- PreSettlement 用了 roundPhase(collectRound) 但没 import（services/round.js 已导出），
  补 import 后 build 通过。纯前端问题，刷新即生效

## 2026-09-16（夜 5）

**时段不对齐的组状态列留白（用户：没读到就空出来）**
- aligned!==true 的组状态列不再显示"公告还停在X，未更新"长文案，改为"—"安静留白
  （选旧回合回看时公告超前是正常现象，不该满屏报警）；对齐的才显示已确认/有行动未确认
- 公告时段徽标列保留（第2天昼等信息仍有用）

## 2026-09-16（夜 4）

**公告时段对齐（用户反馈：选了第5回合，查公告还是昼的旧内容看不出差异）**
- notices/check 加 expectedTurn 参数（GM 正在收的回合）：行动公告文本的时段头
  （"day2夜"/"第二日 昼"）用 extractTimeHeader 解析 → 换算回合（第N天昼=2N、
  第N天夜=2N+1）→ aligned = noticeTurn === expectedTurn
- 未交行动口径升级：没有行动公告 **或 aligned=false（公告还停旧时段）** 都算未交、
  进催交名单
- 前端：查公告传 collectRound；表格加"公告时段"列（徽标+roundLabel）；
  交行动列文案（已确认/有行动未确认/**公告还停在第2天昼，未更新**/未交行动）
- 实测（三国杯真实数据，expectedTurn=5）：剑/杀/狂 aligned=True（day2夜/第二天夜），
  弓/术/枪/骑 aligned=False noticeTurn=4（还停第2天昼）→ missing=弓术枪骑 ✓
  与用户口述"还有组的昼行动没收到"完全一致
- services：checkNotices 加 expectedTurn 参数

## 2026-09-16（夜 3）

**"收时段"升级"收回合" + 改公告重收语义（用户反馈两点）**
- 用户口径：昼夜和回合数绑定，选回合就够；玩家会**改公告**而不是发新公告，且不好测试
- 新增 GET /rounds/list（campaign_round 全量）；services/round.js 加 listAllRounds +
  roundLabel（turn1=降临日，偶=第N天昼 奇=第N天夜）+ roundPhase（偶昼奇夜）
- PreSettlement 操作条：下拉改"收回合"（标签"第5回合·第2天夜（收集中）"），默认选中
  OPEN 回合；AI 代收传 round=turn_number + phase（roundPhase 推），覆盖公告头推断
- agent.mjs collectActions 重排三遍式：
  ①纯解析不落库（pendingStandards/pendingFailures）→ ②有新登记内容才 void 该组旧
  declared（群公告=整篇替换语义；解析全失败不清旧行动防误清）→ ③登记/LLM/裁决。
  summary.totals 加 voided 计数
- 效果：玩家改公告 → GM 再点一次 AI 代收 → 旧行动作废+新清单登记，摘要显示
  "登记 X 条，作废旧行动 Y 条"——改公告重收不需要额外测试手段，看摘要即可
- 修：重排时 unitBase 重复声明的语法错误

## 2026-09-16（夜 2）

**解析器大修：59 条裁决噪音清零，真实公告 7/7 全解析（用户贴的需裁决队列暴露）**
- 根因三层：①解析器只按"第一个空格"切动词，连写/变体全不认；②换行切分后时段头
  不递归剥离；③parse_fail 无防重每跑一次翻倍
- parser.mjs 修复：
  1. preprocess：角色前缀加"英灵"；段首独立"行动"标头剥离
  2. splitAnnouncement 换行分支改递归（每行再过预处理）
  3. parseAction 动词候选链：空格切分 → -/—/:：连写拆分 → "X灵脉 目标"量词剥除 →
     动词前缀连写（干涉白帝城/制作月灵髓液/机动邺城）→ 动词尾缀（镜中双影工坊建设）。
     可用动词集合 = action_rules 白名单 + action 别名首词/别名字面（allActionVerbs，
     60 秒缓存，长词优先防"情报"抢"情报调查"）
- 数据补丁（scripts/patch-parser-20260916.mjs）：alias_registry 补 6 条 action 别名
  （待机→休整/制作→礼装制作/长坂坡征兵→征兵/契约之书→礼装制作/空花结阵→解放 空中花园/
  魔镜卢恩魔术·发动效果2→广泛侦查）；action_rules 补"建设"（抄礼装制造口径）；
  存量 59 条 open parse_fail 一键忽略清零
- agent.mjs / router.mjs parse_fail 插入加防重（同 unit+context open 存在则跳过）
- 实测（/standardize + 真实七组公告）：7/7 样本全解析、失败片段 0——
  枪"干涉→许都"×2、弓"奏乐/机动→邺城"、术"解放→空中花园/建设→镜中双影工坊/
  礼装制作→月灵髓液"、杀"情报调查→二哈/礼装制作"、狂"征兵/干涉→白帝城"、
  骑"机动→邺城/休整"、剑夜"干涉→许都"
- 附：post /rulings/bulk-ignore 批量忽略接口（campaignId）；正式后端 open 裁决已清零

## 2026-09-16（夜）

**历史记录入库（用户："我有之前的记录吗，帮我记录到库里面"）**
- 记录来源：备份 zip 的 1.15/ 目录（tar 解压，Windows 自带 bsdtar 对 GBK zip 文件名处理正确；
  PowerShell .NET ZipFile 解 GBK 名会乱码+非法路径，别再用它解这个包）
- 新增 scripts/import-legacy-sanguocup.mjs（幂等：回合/历史先清后写）：
  1. campaign_round 对齐真实进度：turn1=跳伞(closed) turn2=第1天昼(closed) turn3=第1天夜(closed)
     turn4=第2天昼(closed) turn5=第2天夜(OPEN 正在收)——与用户"第四回合（第二日昼）"口径吻合
     （turn1=降临日，每时段一回合）
  2. action_history 快照×3：turn1 跳伞降临落点（说明.md 落点表 7 组）、turn2/turn3 第1天昼/夜
     行动（结算记录 md 表格 7 组×从者/御主）
  3. message_log ← 群聊记录 2693 条（含全部群号+群名：7 私组、6 灵脉群（魔力量/人流量格式）、
     天意公平公屏——auto-detect 的历史群名从此有据可查）
  4. 魔力转让台账追加 3 条（剑80/狂80/骑30）
- 踩坑：md 夜 section 的"当前魔力池"表会被行动表正则误抓（| 弓 | 50/50 | 80/150 |）→
  行动表固定在"### 行动提交"小节，二次切分 + 组数≠7 中止导入的防脏数据检查
- DB 备份：gm_helper.backup-before-legacy-import.db + backups/gm_helper-2026-09-16-152455.db
- 历史文件存档：backend-node/data/legacy-import/1.15/（结算/契约/拍卖/术语别名等 md/jsonl）
- 拍卖/契约/术语别名暂未进库（存档可查），后续可进 kb 知识库或专用表

## 2026-09-16（晚 8）

**静音模式（用户要求：歇息中卡住发消息）+ AI 代收时段选择**
- 用户指出游戏进度：第四回合（第二日昼）已收完，现在应收**第二日夜**的行动；
  现实中大家在歇息，机器人不能往群里发消息
- 静音机制：onebot 配置加 muted（app_settings）；拦截点在 service.js 的两条 WS 调用路
  （指令回复 callOnebot + engine qqport 的 wsCaller），isSendAction(/^_?send_/) 命中即拒，
  错误标 err.muted=true；qqport.callNapcat 对 muted/fromNapcat 错误不再回落 HTTP
  （否则 HTTP 回落会绕过静音真发出去——实测堵住）
- 拦截范围：AI 代收的回执/催办、一键催交、指令回复、群公告发送全拦；
  读公告/get_group_list/get_login_info 等只读操作不受影响——AI 代收在静音下=只收不发
- DB 已置 muted=true；前端两处开关：机器人连接页大开关 + 结算前操作条切换按钮
  （status 接口返回 muted，结算前 refresh 顺带同步）
- AI 代收时段选择：PreSettlement 操作条加 昼/夜 下拉（collectPhase）→ runAgentCollect
  带 phase → agent-router /run 已支持 → collectActions 登记归到指定时段
- 验证：muted=true 下 send_group_msg 被拦（WS/HTTP 回落双路都拦）muted 标记正确；
  get_login_info 正常；正式后端 muted=true connected=true enabled=true
- 待办提醒：用户说"还有时间改到能用"——后续把时段/回合状态条和引擎推进对齐
  （当前 DB 里 OPEN 回合是 turn 1，游戏内已到第四回合=第二日昼，需要用户用"下一时段"
  推进或手动改）

## 2026-09-16（晚 7）

**修"枪组昼行动没收到"（公告格式又一种写法）**
- 漏收的枪组公告："第二日 昼\n从者 干涉灵脉 许都\n御主 干涉灵脉 许都"
  旧规则两处不认：时段正则要求"天"字（这里用"日"）；条目特征要求"从者"+冒号（这里是空格）
- isActionNoticeText 重写：时段正则支持"天/日"+空白+昼夜；条目特征 = 冒号形式
  或 空格+内容（排除"从者代号"状态格式）；时段+条目同时出现才算（防状态公告误判），
  冒号条目可单独成立
- 新增 9 个真实样本规则测试（七组旧格式+枪组新格式+两条状态公告）全过；
  实测 check：submitted=7 missing=0，枪组昼行动正确识别
- 用户现在重新点"AI 代收行动"即可补登记枪组昼行动（已有组按幂等跳过）

## 2026-09-16（晚 6）

**公告分类：行动公告 vs 状态记录（用户指出引擎分不清两种公告）**
- 真实格式（用户贴的七组公告实测样本）：
  - 行动公告：时段开头（day2昼/第二日昼/第二天夜）+ 从者：/御主：/英灵：条目；.确认行动
    生成"本回合行动确认"格式
  - 状态记录：枪组带【第2天昼 状态记录·更正】标题；剑组是"魔力池 185/270 常补： 持有："格式
- qqport.mjs 新增 isActionNoticeText / isStatusNoticeText / pickActionNotice / pickStatusNotice：
  - 行动：行动确认格式 | 时段开头正则 | 从者：/御主：/英灵：+冒号
  - 状态：状态记录标题 | 魔力数值对（魔力 80/110）| 魔力池
  - pickStatusNotice 排除行动公告（行动公告里也可能有魔力数值）
- notices/check 重写：拉全部公告分拣，返回 hasAction/actionText/hasStatus/statusText 分列；
  是否交行动看 hasAction（只有状态记录=未交）；missing/催交名单同口径
- agent.mjs collectActions 改用 pickActionNotice（AI 代收不再把状态记录误当行动）
- 前端公告检查表改三列：交行动状态 | 行动公告 | 状态记录；分类规则写进页面说明
- 实测（三国杯真实数据）：submitted=6 missing=1（枪组只有状态记录·更正）failed=0；
  剑组新发的 day2夜 行动公告被正确识别（与旧状态记录并存分列）

## 2026-09-16（晚 5）

**修"类型/职阶没自动填"（用户反馈：灵脉填了但类型职阶空着）**
- 前端 doDetect 字段映射疏漏：后端返回 suggestedKind/suggestedClass，表格绑定 kind/class，
  只映射了 leyline 字段漏了这两个 → 候选表下拉全空
- 修复：map 时补 kind: suggestedKind、class: suggestedClass（灵脉群下拉自动带灵脉名）

## 2026-09-16（晚 4）

**修"只识别到 6 灵脉缺 7 私组"（用户预期 6 灵脉+7 私组）**
- 真相：13 个相关群都识别到了，但 6 个职阶群（群名无"魔力/结界"字样，只有职阶字如
  "术组/杀组"）被判 relevance=low 默认不勾，用户以为没搜到
- 修复：detectRelevance 加 kind/class 参数——**群名带职阶字 = 职阶群（私组）直接升 high**
  （理由"群名带职阶字，是本战役职阶群（私组）"；GM 口径"职阶群就是私组"）
- 实测：high total = 13（6 leyline + 7 private 职阶：术弓枪剑狂杀等），符合预期
- 另：用户报"页面没有群映射卡片" = 浏览器缓存旧版前端，Ctrl+F5 强刷解决；
  群映射面板已从结算前页挪到「设置 → 群绑定」页签，报错文案同步指路

## 2026-09-16（晚 3）

**群识别规则按 GM 口径细化（用户补充）**
- 三类群的真实口径：职阶群=私组（已对）；**群名带"魔力量/人流量"=灵脉群**（GM 改群名
  同步灵脉数值）；公屏已有
- detectKindAndClass 加灵脉规则（魔力量|人流量 → leyline，优先于职阶判断）；
  GROUP_NAME_HIGH 也加上（灵脉群同样算战役强信号）
- 新增"关联灵脉"推断：guessLeylineName 按群名匹配本战役 leyline 表 name（取最长命中，
  避免"灵脉-A"/"灵脉-AB"误选）；auto-detect 返回 leylines 列表供前端下拉
- 前端候选表加"关联灵脉"列（kind=leyline 时启用，预填建议值）；已登记列表显示灵脉名
- 实测：6 个灵脉群全部正确分类且 leyline 自动匹配到三国杯灵脉名（泰然冢/寻香冢等冢名）

## 2026-09-16（晚 2）

**群识别加相关度过滤（用户反馈：九条兼营私骰，27 个群大多无关）**
- 相关度四级判定（engine/router.mjs detectRelevance）：
  - high：群名带战役状态格式（魔力/结界/战况/圣杯/令咒/灵脉）——三国杯职阶群改名特征，极强信号
  - medium：历史消息含圣杯术语 1-2 条；high：命中 ≥3 条（术语表：魔力/结界/灵脉/令咒/
    从者行动/御主行动/魂食/圣杯/人流量/回路/降临/战况）
  - unrelated：群名像其他跑团（COC/SAN/克苏鲁/DND/TRPG/骰/跑团）且无强信号——疑似私骰群
  - low：其余
- 实测（三国杯 27 候选群）：7 个"魔力剩余/结界等级"职阶群 → high 默认勾选；
  SAN.CHECK/COC/骰子花园 TRPG 群 → unrelated 排尾不勾；fumo/dsh 闲聊群（有历史消息但
  无术语）→ low 正确判无关
- 前端：相关度徽标（颜色区分）+ 理由文案 + 默认只勾 high/medium + 无关行半透明排序靠后

## 2026-09-16（晚）

**群映射自动识别（用户问"面板配置是什么、能不能从 log 自动填"）**
- "面板配置"= engine_group_binding 群映射（旧引擎面板已删，接口还在）：私组/公屏/GM/灵脉群
  与职阶的对应表，查公告/催交/AI 收行动的前置
- 自动识别实现（用户诉求"用之前的 log 自动填"）：
  - 后端 GET /engine/groups/auto-detect：机器人所在群（NapCat get_group_list 走 WS，带群名）
    + message_log 群活跃度（历史 log 群号来源）→ 排除已登记 → detectKindAndClass 按群名
    猜类型/职阶（弓枪骑剑杀术狂含英文变体；公屏/GM 关键词）
  - POST /engine/groups/bulk 批量写入
  - 前端 GroupMappingPanel.vue 嵌结算前页：识别候选表（勾选+类型/职阶可改）→ 保存 → 已登记列表可删
- 实测：三国杯拉到机器人所在全部 27 群，群名含职阶字正确推断（枪/杀等）；
  保存映射后查公告真实调通（WS → NapCat 读群公告，failed: 0），测试数据已清理
- 群名实例：三国杯职阶群改名带状态（"白跌夺 魔力剩余20 结界等级2 战况：平静"），
  职阶字仍可被识别

## 2026-09-16（傍晚）

**修"登录成功但查公告报未配置 HTTP 地址"**
- 根因链（三层）：
  1. 一键流程预写的 onebot11.json 只有 WS 没有 HTTP 服务端 → 补齐 httpServers(3000) 幂等升级
  2. NapCat 登录后生成**账号专属配置** onebot11_<QQ>.json，优先级高于兜底文件——
     ensureOnebotConfig 改为优先写账号专属文件（launch/restart 都传 qqNumber）
  3. NapCat 官方 HTTP 服务端实测始终不起（配置格式与源码 schema 一致仍不起，原因未明）
- 终解：**读公告/发消息/催交改走 WS action**（OneBot v11 正向 WS 与 HTTP 同一套 action，
  实测 _get_group_notice/_send_group_notice/send_group_msg 都通）：
  - engine/qqport.mjs 加 setWsCaller + callNapcat WS 优先、HTTP 回落
  - service.start() 注入 WS 调用器；agent/router 的 napcatBase 硬校验放宽
  - 业务错误（NapCat 已响应）标 fromNapcat=true 直接上抛，不再回落 HTTP 报误导性 "fetch failed"
- 附带修：stopNapcat 改 taskkill /T /F 杀进程树（原 kill 只杀 cmd 壳，留下 5 个孤儿
  NapCatWinBootMain 占着登录态）；launch.log 重定向修进命令字符串
- 验证：WS 直调 get_login_info OK（机器人"九条里奈"在线）；业务错误 fromNapcat 正确传播；
  connected: True；测试群映射已清理
- 遗留：NapCat HTTP 服务端不启动的原因未查明（fileLog 开了但 logs 目录无文件），
  已不影响功能；后续服务器部署若必须 HTTP 再查

## 2026-09-16（午后 5）

**修"扫完码不自动变绿"（用户反馈）**
- 根因 1：wsBot 重连退避上限 60 秒——扫码前一直连不上（NapCat 未登录 3001 不开）退避
  已涨满，扫码成功后最长要等 60 秒才重连。改为上限 15 秒 + 新增 reconnectNow()（跳过退避）
- 根因 2：配置里 enabled=false——"启用机器人"开关被收进高级选项折叠里，一键流程没打开它。
  修复：POST /napcat/launch 时自动 writeConfig({enabled:true}) + restart（用户点"登录机器人"
  = 意图明确，开关不该挡路）
- 感知链路：前端扫码阶段每 2 秒轮询 install/status（refreshFlow 里顺带 refreshStatus）→
  该接口在 webuiRunning 时调 service.poke() 踢 wsBot 立即重连 → connected 变化 2 秒内上屏
- 验证：模拟点按钮 → connected: True（NapCat 登录态复用），enabled 自动翻 true

## 2026-09-16（午后 4）

**网页扫码登录做通（海豹级：一个按钮，扫码即用）**
- 用户新要求：像海豹一样在网页上扫码，别再调连接。方案定型并实测全链路通过：
  1. 新增 `backend-node/lib/onebot/napcat.js` 托管模块：ensureNapcat（自动下载 NapCat.Shell.zip
     28MB→tar 解压→探测启动器）→ ensureOnebotConfig（预写 config/onebot11.json 正向 WS
     对齐工作台配置，v4.5.3+ 支持）→ launchNapcat（launcher-user.bat QQ号 隐藏窗口拉起）
  2. 二维码获取：**读 NapCat 写的 cache/qrcode.png 文件**（实测确认，mtime 10 分钟内有效），
     WebUI 未公开 API 仅作兜底——比猜接口稳定
  3. 启动器优先级实测结论：launcher-user.bat（用户模式免管理员）> napcat.bat > launcher.bat
     （要 UAC）> NapCatWinBootMain.exe（OneKey 引导，需先跑 NapCatInstaller 下载 QQ 资源）
  4. 包选择：检测 C:\Program Files\Tencent\QQNT\QQ.exe 存在 → NapCat.Shell.zip（28MB 注入本机 QQ）；
     没有才用 OneKey 包
- 实测时序：触发 launch → 8 秒完成下载(67%→100%)+解压+启动 → WebUI 6099 就绪 →
  qrcode 接口返回 dataurl（data/napcat/cache/qrcode.png + config/onebot11.json 均生成）
- 前端 BotConnection.vue 重做：大按钮"登录 QQ 机器人"→ 进度条（下载%→解压→启动）→
  二维码显示 → connected 变绿；WS 地址/token/目录全部折叠进"高级选项"默认收起
- 踩坑：
  - OneKey 包直接跑 bootmain/NapCatWinBootMain.exe 报 Error Code 2（缺 QQ 资源），
    正确入口是先 NapCatInstaller.exe——改用 Shell.zip 注入本机 QQ 避开
  - launcher.bat 非管理员直接退出（"Please run administrator mode"），launcher-user.bat 免管理员
  - NapCat 有守护：杀单个进程 6099 会被拉回，用包内 KillQQ.bat 清干净（注意它会全杀 QQ.exe，
    用户自己登的 QQ 也会被关——清理时提醒用户重开）
- 用户体验最终形态：设置→机器人连接→点"登录 QQ 机器人"→扫码，全程无配置词

## 2026-09-16（午后 3）

**托盘升级自愈 + 开机自启（用户反馈：连接老断、不如骰子核心方便）**
- 后端再次掉线的根因：托盘第一版没有自愈，node 死了只会菜单显示"未运行"等人手点
- gm-tray.ps1 升级：定时器（3 秒）里加 Auto-Heal——端口没服务自动重新拉起后端，
  8 秒节流防启动中重复杀；手动"退出"置 quitting 标志后才真正停（否则会被自愈拉活）
- 新增 `设置开机自启.bat` / `取消开机自启.bat`（写/删 shell:startup 的 .lnk）；
  已帮用户装上自启（Startup\FateGM工作台.lnk 已验证存在）
- 三个 bat 均转 GBK 编码（cmd 默认代码页），ps1 保持 UTF-8 BOM
- 验证：杀后端 → 12 秒内自动复活 → 页面 HTTP 200；托盘进程存活
- 用户体验口径：和海豹一样 = 双击一次 bat（或开机自启），之后托盘常驻、后端挂了自动爬起

## 2026-09-16（午后 2）

**用户反馈两处：左侧页签固定贴左缘 + 速查扩容到全资源**
- 顶栏双行（主 tab 46px + 战役选择条 46px）改 sticky 吸顶；战役/设置 tab 的左侧页签栏
  改为贴屏幕左缘固定：sticky top:92px + 满高 calc(100vh-92px) + 白底右边界线，
  内容区右移（标题条/回合条 margin-left 让开 140px）；两页同款保持一致
- 速查浮窗从三源扩到五源：模板库/本战役角色卡/灵脉(名字+效果匹配)/历史行动(快照行动
  展开成扁平列表过滤，限 20 条)/规则原文(kb)；空态文案同步更新
- 踩坑：QuickSearch 加灵脉/历史行动时两次 edit 操作互相抵消（第二次误把第一次的插入当
  重复删了），发现后重读文件再一次性改对——多次 edit 同一区域前先确认当前状态
- 验证：build 通过，dist 产物确认含新 CSS（calc(100vh - 92px) / sticky topbar）

## 2026-09-16（午后）

**系统托盘（仿海豹骰）：双击启动/托盘关停后端**
- 新增项目根 `启动GM工作台.bat` + `gm-tray.ps1`：PowerShell NotifyIcon 画托盘图标（藏蓝圆底 G 字），
  零第三方依赖；Mutex 防多开
- 托盘职责：端口 8100 没服务时自动拉起 backend-node（隐藏窗口）；菜单=后端状态(点按重启)/
  打开工作台/重启后端/退出（停后端收图标）；双击图标=开工作台页
- 踩坑：Write 工具出的 ps1 是 UTF-8 无 BOM，PowerShell 5.1 按 GBK 解析中文直接语法报错、
  托盘进程秒挂——转 UTF-8 BOM 后正常；bat 转系统 GBK。以后改这两个文件注意编码
- 验证：托盘进程存活、自动拉起 node index.js、8100 HTTP 200；用户机器上的 server.js（另一项目）不受影响

## 2026-09-16（早）

**前端按 excalidraw 草图整体重画（用户拍板：旧页面全删，本批先完成战役部分）**

设计骨架（来自 草图/ 四张总体图 + 14 张次级页）：
- 顶部四大主 tab：战役 | 战斗 | 小工具 | 设置；顶栏第二行全局"选择战役"；右上角"速查"浮窗
- 设计 token（style.css 重写）：工作台面灰 --c-desk + 表体纸白两层背景；藏蓝 --c-primary 唯一主色；
  自动计算格 --c-auto #d0ebff（NOTES 09-15 定的约定）；金色只用于需裁决/警告；圆角全站一种 6px；
  无渐变无发光；旧 style.css 的米色渐变+阴影营销风废弃

本批交付：
- 新壳：App.vue（主 tab + 战役选择条）、router（/campaign/:subTab /battle /tools /settings）、
  useCurrentCampaign.js（全局战役单例，切战役同步后端 selected）、QuickSearch.vue（一次关键词
  同时搜 模板库/本战役角色卡/规则原文，规则原文接 kb search，未构建时降级提示）
- 战役 tab（CampaignPage）：顶部全局回合状态条（第 N 回合/收集中 + 下一时段[引擎 advance] +
  开启/关闭收行动）+ 左侧 8 页签（components/campaign/）：
  - 结算前：行动提交汇总表 + 查公告(checkNotices)/一键催交(remindGroups)/AI 代收(agentRun)
  - 行动结算：5.2.6 状态结算展示 + 结算链逐步确认条(机动→魂食→干涉→解放→制造→休整→摧毁工房)
    + 引擎行动表 + 手动补录登记 + 需裁决队列(rulings/resolve)
  - 信息结算：情报卡生成（选角色+披露层级 1-4 拼文本复制）+ 广泛侦查结果（引擎 locations）+ 发送记录占位
  - 魔力结算：当前回合各单位魔力账面；流水台账占位
  - 轮次结算：供给/消耗口径 + 关回合生成快照 + 快照列表
  - 及时结算：三条判定标准 + 记录表（localStorage 暂存，已标注）+ 待确认队列占位
  - 历史行动：回合快照列表 + 展开从者/御主行动明细 + 回合/关键词筛选
  - 灵脉：全量 CRUD + 规模段位 + 驻扎单位（leyline_assignments 对齐角色卡）+ 效果速览；人流流水/补给分配占位
- 设置 tab：战役管理（新建/切换/删除）+ 角色卡管理（CharacterCardUpload 迁移，1182 行，去 route
  依赖改用 selected 战役）+ 机器人连接（昨天做的页面迁入）
- 小工具 tab：技能模板库/提交确认/技能记录三页签（迁移）+ AI 车卡/AI 宝具技能作成/Q&A 判例/未完待续占位卡
- 删除：Home/BattleControl/BattleSheetPage/BattleSheet/EnginePanel/EngineBattleSheet/RuleAdvisor/
  NavBar/HelloWorld/components/battle 全部（10 页面+组件）；services/* 与 composables/*（战斗计算逻辑）保留给下一批

踩坑与修正：
- 接口字段坑：/rounds/current 返回 { round: { turnNumber } } 嵌套驼峰；/rounds/history 返回驼峰数组
  且 servantActions 已是数组（第一版按 snake_case+JSON 字符串写，playwright 验证抓出 undefined，已修）
- 迁移文件的正则批量改路径漏了动态 import（SkillSubmissionConfirm 里 await import('../services/...)），build 报错后补改
- playwright 验证：全 tab 渲染正常、战役切换数据联动（三国杯 11 灵脉）、0 console 错误

下一步待办：
- 战斗 tab：按 00-双方战斗表 草图复刻 Excel 大表（5 分区+6 步骤），useBattleCalculator/settlementOrder 已就绪
- 战役 tab 占位块补后端：发送记录、魔力流水、人流变动/补给分配、转魔确认流
- 速查浮窗接入判例（Q&A 判例系统未建）

## 2026-09-16（凌晨）

**QQ 指令机器人迁入 backend-node（B 路线：去掉 Koishi 层）**
- 调研定案：海豹骰"内置登录"= 打包 Lagrange 协议端 + UI 扫码；协议层与 Koishi+NapCat 同为 OneBot。
  用户拍板 B 路线：backend-node 直连 NapCat 正向 WS，扫码仍在 NapCat WebUI（C 路线"产品内扫码"留作增量）
- fate-actions 源码从备份 zip（fate-三国杯-备份-20260906-2140.zip）解出 28KB index.ts，
  15 条指令逐条迁到 `backend-node/lib/onebot/`（新模块，CJS）：
  - `wsBot.js` OneBot v11 正向 WS 客户端（原生 WebSocket 无依赖、5s 起步指数退避重连、
    echo 匹配 action 调用、10s 超时）
  - `commands.js` 指令处理器；`service.js` 组装（配置存 app_settings 表 key=onebot_bot_config）；
    `routes.js` 挂 `/api/onebot`（config/status/restart）
- 指令去向：绑定战役/当前/从者行动/御主行动/转魔/ra/改群名/发公告/群公告/确认行动/群列表/群成员/
  指令（帮助，新增）保留；**.潜入 删除**（用户确认：规则书查证无潜入行动，docs/行动规则总表.md 09-07）；
  .下一时段/.行动表 降级提示（原依赖旧机器 X:\ Excel+python 路径）
- 复用现有资产：群聊记录不再迁移（engine/agent 旁听已落 message_log）；
  qqws.mjs/qqport.mjs 保持"只读旁听"职责不动，指令机器人是独立 WS 连接（NapCat 支持多客户端）
- 修正旧插件 bug：首词职阶判定原来是 `normalized !== firstToken`，首词直接写"术/弓"标准字
  会被误判落到群名识别；改为 `VALID_CLASSES.includes(explicit.normalized)`
- 行动提交走本机 HTTP（callLocalBackend → 127.0.0.1:PORT/api），与原插件行为/错误文案一致；
  转魔台账从旧配置路径改为固定 `backend-node/data/magic-transfers.jsonl`
- 前端新增 `/bot-connection`（BotConnection.vue + services/onebot.js），NavBar 加"机器人连接"入口；
  token 不回明文只回"(已配置)"占位符
- 验证：单测 `test/onebotCommands.test.js`（含 mock 分发集成测试，抓到上面的职阶 bug），
  `npm test` 全绿；`npm run build` 通过；playwright 实测页面渲染/保存→重连→状态回传全链路 OK
- 遗留：my-koishi-bot 项目可退役归档（服务器侧还有一份 fate-actions 在跑，切换时 NapCat WS
  配置改指 backend-node 即可）；服务器联调待做（本地无 NapCat 环境）

## 2026-09-15（晚 18）

**战斗总表加步骤控制（用户确认版式后补充）**
- 表样式确认 OK；补充需求：分成多个步骤、顶部带箭头流程、**每步骤都要记录**、
  冲锋提交放战斗位确定且要确定冲谁
- 00-双方战斗表 更新（410 元素）：
  ① 标题改"战斗位确定 + 冲锋（步骤 1）"，加冲锋行（袭击方"已提交→冲：Archer▾"，
  冲锋目标下拉从对方参战单位选）
  ② 自动随步骤 1；③④ 步骤 3 初始阶段（三属性对抗需先选主要属性）；
  ⑤ 步骤 4-6（主要工序修正填[主要]列）
- 流程控制说明行：当前步骤操作完 → [确认进入下一步] → 本步骤表状态与操作自动
  存档记录（复盘按步骤回看）；未到达的步骤区域锁定不可编辑
- 实现口径：表是单页集成，步骤控制=分区编辑权限开关 + 每步骤快照存档；
  前端按当前步骤隐藏/锁定未开放分区，确认动作写 battle_sheet_steps 记录

## 2026-09-15（晚 17）

**战斗表页面重画：复刻 Excel 战斗表真实版式（用户纠正排版）**
- 用户纠正：不是 6 张独立工序页，Excel 战斗表是一张纵向集成大表，战斗位确定就在
  战斗开始表上（GM 单元格下拉选人 → 属性自动填入 → 总值自动 → 魔力不足自动查）
- 找到 Excel 原件：备份 zip 内 1.15/战斗表.xlsx，"双方战斗表" sheet（93 行）真实结构
  = 5 个纵向分区：①战斗开始时（选人+自动属性+战前补惩）②属性结算组别明细
  ③三属性对抗→基础胜率（组别A+胜率档位表+自动优劣调整）④组别B（属性A/B/随机）→总值
  ⑤最终工序胜率链（基础→战前→初始→主要→差值减半→保底→最终）
- 新页面 00-双方战斗表.excalidraw（gen-battle-sheet-page.mjs，395 元素）：
  复刻 5 分区，白格=GM 手选/手填（单位行下拉）、蓝格=自动计算；步骤条降级为进度指示
  （操作都在表上完成）；自动格浅蓝底 #d0ebff
- 之前画的 6 张工序页（01-06）保留在目录里但定位变了：将来是"工序弹层/详情"，
  大表才是主操作面；是否删除等用户定
- 实现口径：前端战斗表页面 = 单页集成大表（对齐 Excel），工序进度条做状态指示；
  自动计算逻辑 useBattleCalculator.js 已有

## 2026-09-15（晚 16）

**战斗 tab 次级页面 6 张完成（Excel 计算表样式，用户建议采纳）**
- 用户建议按旧 Excel 战斗表画；Excel 本体在备份 zip（battle-sheet-xlsx），
  结构已文档化于 docs/战斗结算规格.md（基础胜率 9 分制/胜率链 E 列公式/战术克制环/
  战场宽度位组合/结算链多级排序）——按文档画，Excel 原件有空可对照校准
- 每页主体 = 战斗计算表（行=结算项目，袭击方|被袭击方两列，Excel 行列样式），
  各阶段 = 计算表在该工序的状态 + 操作块（gen-battle-subpages.mjs）
- 6 页对应规则书 4.1-4.5：战斗位确定（参战位/属性/魔力不足）→ 战斗开始时（冲锋/
  常驻展露/能力响应/战术克制/基础胜率）→ 初始（能力/主要属性6选1/随机属性骰定）→
  主要（技能宝具/效果链落账/需裁决/魔力随结算扣）→ 最终（死斗+20%/保底clamp/
  最终胜率）→ 决胜检定（D100/等级魔耗/消散/俘虏/落账回写快照）
- 战斗表页面设计齐了：战役 tab 7 张 + 战斗 tab 6 张 = 13 张次级页面草图

## 2026-09-15（晚 15）

**02/05 页面调整（用户反馈）**
- 02-行动结算最前面加"回合开始状态结算"块：中毒/灼伤/感电等按 5.2.6 状态链
  （抗性→特性赋予→封印→晕眩→恐惧→魅惑→迟滞→石化→灼伤→感电→中毒）处理，
  层数递减/持续伤害先落账，处理完才进行动链——引擎 settler 的状态结算前置依据
- 05-轮次结算精简：只留每轮魔力供给（回路/灵脉/圣杯）+ 每轮消耗（等级魔耗/
  溢出移除/不足惩罚）+ 对账关回合操作；状态变化汇总/状态继承/历史快照块删除
  （用户："没什么用"；历史快照查询走 07 历史行动入口）
- 实现提醒：轮次结算的快照生成仍要做（rounds/close-current），只是页面不展示
  diff/继承确认这类花活，GM 不需要

## 2026-09-15（晚 14）

**解放占行动判例落定：方案 B（用户拍板，本杯生效）**
- 结论：规则书对"消耗行动阶段"采用明示制——明写者（空中花园/断壁残垣/崇高余晖）
  才占回合行动；未写者（鲜血神殿类，时机=行动阶段）可解放且不占本回合行动，
  解放后同回合仍可执行其他行动（如遮断），回合末效果叠加
- 已写入 docs/行动规则总表.md 第七节第 7 条（已确认清单，标注"三国杯 GM 口径，
  换团需复核"）；引擎实现：行动阶段时机+未写消耗行动 → 不做行动力校验
- 遮断×鲜血神殿组合因此成立：同回合遮断+开鲜血可行，成功场合回合末三来源叠加
  （遮断当下/遮断回合末/神殿回合末 = -3+180）
- 剩余待定判例 2 个：遮断失败当下吃不吃、鲜血神殿回合末吃人公开性

## 2026-09-15（晚 13）

**【修正】解放占行动 → 改判存疑（用户反证有效）**
- 上轮"没写=默认占行动"的结论作废。用户反证：空中花园明写"消耗行动阶段"，
  鲜血神殿同为赋予结界宝具却没写；且交流环节（规则书 L199）允许"某些能力的发动"，
  存在不占回合行动的发动空间——若解放必然占行动，交流解放就不成立
- 证据两侧：
  占行动：解放是行动类别（3.3）；L329-330"不消耗行动力的行动立刻结算"暗示消耗是默认
  不占/存疑：空中花园/断壁残垣/崇高余晖（"消耗行动阶段解放"）均明示而鲜血神殿没写，
  规则书抠字眼传统下差异应有意义；交流"某些能力发动"条款
- **待定判例：鲜血神殿（及同类未写"消耗行动阶段"的解放宝具）占不占回合行动，
  需问规则作者/群内裁定**；裁定前引擎对"行动阶段时机+未写消耗行动"的宝具
  应给 GM 提示而非自动扣行动
- 教训：规则口径题不要用"默认+反证"轻下结论，两侧证据都要摆
- 空花（空中花园）验证：确实明写"消耗行动阶段" ✓（从者扩充包 L319）

## 2026-09-15（晚 12）

**遮断×鲜血神殿结算口径（用户问询，含存疑判例）**
- 魂食遮断白天=30%（夜 50%；昼间+20% 只给广侦不帮遮断）
- 遮断成功：当下 -1+60，回合末再 -1+60（L158 无论成败），共 -2+120，通告延后到
  行动阶段结束；失败：字面当下不吃（L151 只写成功场合结算），立即全局通告+介入
  指令，回合末 -1+60，共 -1+60
- **存疑判例待 GM 定**：遮断失败当下那口吃不吃（字面=不吃；语义上"掩饰失败=吃了被
  抓包"也通）→ 定了记入 mana_rules/口径表
- 遮断与开鲜血神殿同回合互斥（一回合一个行动，解放也占行动）
- 鲜血神殿已开状态下再遮断：回合末三来源叠加（遮断当下/遮断回合末/神殿回合末），
  成功场合合计 -3+180——魔力流水"来源"列必须分笔记录
- 实现落点：engine 结算器要把"行动当下效果"和"回合末效果"分开挂账

## 2026-09-15（晚 11）

**鲜血神殿机制查证（用户规则问询）**
- 他者封印·鲜血神殿（从者库 L527，对军宝具，发动时机=行动阶段=解放，占一次行动）：
  开结界该回合不能再主动魂食；但 L532"每回合结束时人流-1、自补+60/50/40"是结界
  自动效果，不占行动不需宣言，开结界当回合即生效
- 御主结界（罗生三相/七重守护）明文"消耗行动阶段发动"✓
- 案例补全资源三分类：行动（解放类）/及时结算（随时+不耗行动+灵脉对象）/
  **轮次结算效果**（每回合结束自动触发，如鲜血神殿吃人、神祝仪式轮始补正）
- 存疑待 GM 口径：鲜血神殿回合末自动吃人是否公开可知（规则书未写，永夜+隐藏
  遮蔽魂食信息的上下文里倾向隐蔽，但无明文）
- 实现提醒：skill_template 需要"效果触发类型"维度（主动解放/即时/回合末自动），
  只有时机字段不够

## 2026-09-15（晚 10）

**"随时"规则查证结论（用户要求核实，非明文设计而是 GM 口径）**
- "消耗行动"=资源库明文（15 条固定写法"消耗行动（阶段）发动"）✓
- "随时"技能混用两种场景，元数据分不出：战斗内（秘剑·燕返/身若惊鸿"指定对方
  战斗位"/对人对军对城宝具）vs 战役地图（忏悔祷文"行动失败时才能发动取消其行动"=
  及时结算类）；区分只能看描述关键词（战斗位/主力位/解放/工序=战斗系；灵脉/行动/轮次=战役系）
- 规则书无"随时"场景定义：5.2.5 时机结算链（常驻→指定工序→随时）只是战斗内顺序；
  "随时"字面仅出现在契约条款（随时宣言撕毁契约）
- 结论：用户口径"对战斗位单位的随时必须战斗中开"成立，但属 GM 归纳口径，
  需存档为正式规则；skill_template 的"作用对象"字段必须 GM 人工选，
  系统可按描述关键词（战斗位/工序/解放）辅助提示
- 06 判定标准块已补注"资源库元数据不标作用对象，按描述人工判定"

## 2026-09-15（晚 9）

**及时结算判定标准定稿（用户口述+资源库验证）**
- 三条同时满足才算及时结算：① 发动时机=随时 ② 不消耗行动力（标"消耗行动"的走行动
  结算）③ 作用对象=灵脉上的单位——对战斗位单位的"随时"必须战斗中开（走战斗表）
- 资源库验证：72 条"随时"标注（含大量对人/对军/对城宝具=战斗位对象反例）、15 条
  "消耗行动"标注（阵地建设/机巧人偶/结界付与等），均为固定格式可结构化提取；
  特例：御主资源库 L169 魔术结界=灵脉上随时开、效果打战斗位
- 06-及时结算 页面顶部已加判定标准块
- 实现落点：skill_template 需补"作用对象"字段（灵脉上单位/战斗位单位），
  资源库导入时发动时机/消耗魔力可自动提取，作用对象需 GM 录入时补选

## 2026-09-15（晚 8）

**介入规则入图（用户补充）**
- 机动 / 魂食可被介入（GM 口径：曝光时公屏提示可介入 → 玩家私组提交 → 该单位本回合
  行动替换为「介入xxx（灵脉）」，占行动力）；介入最优先处理、不受能力消除；
  本回合已介入或已执行同类行动则不可
- 02-行动结算 加"介入处理"区块+魂食示例行标注（可介入事件）
- 实现落点：结算页在机动/魂食环节显示"已有 X 组提交介入"供 GM 决定替换；
  engine parser 动词白名单已含"介入"（行动规则总表 #18）

## 2026-09-15（晚 7）

**时间线砍成 4 步（用户拍板，魔力结算节点取消）**
- 魔力职责拆分：宝具/技能消耗 → 随行动结算即时扣；每轮补给（回路/灵脉/圣杯/等级魔耗/
  溢出移除）→ 轮次结算页；转魔实时流水 → 06 及时结算入口
- 信息结算重新定位 = **情报发送工作台**（用户："主要用来复制广泛侦查结果和选卡截图发送，
  独立放出来避免手贱发错"）：广侦一键复制 → 选角色+披露层级（样貌/面板/技能/全情报，
  对应广侦/调查/真名规则）→ 预览 → 目标群核对 → 复制为图片 → 发送记录可追溯；
  原来画的情报获取/暴露记录块被用户否了（"其他的没有什么用"）
- 次级页面剩 7 张（04-魔力结算已删，编号不重排）；总览图 4 步重排+面板文字更新
- 踩坑复现：用 `find(e => e.text.startsWith('行动结算'))` 改面板文字时误匹配到同名
  节点短标签，把节点文字污染成多行内容——批量改文字必须用 id 或"前缀+x 坐标区间"
  精确定位，不能只用内容前缀
- 待确认：战役 tab 至此基本收敛，下一步=战斗 tab 次级页面 or 开搭前端骨架

## 2026-09-15（晚 6）

**机动/干涉的灵脉口径（用户补充，重要实现依据）**
- 机动/干涉行动必须记录出发灵脉：战斗失败返回出发灵脉（可能进游荡，规则总表 #5）；
  干涉结束询问"留下（进驻）还是返回"
- 灵脉有落地/触发 buff（依据 knowledge/灵脉设计范式.md 三类效果：被动常驻=进驻生效
  离开失去、宣言触发、轮次结算；层数叠加如[骄1]~[骄3]）——单位抵达灵脉时前端要弹
  效果卡提示 GM
- 图面已更新：02 行动列带出发灵脉+去向规则块+落地效果提示块；08 加各脉效果速览块
- 实现提醒：engine 行动记录表需要"出发灵脉"字段；灵脉效果数据要结构化（不能只存文本），
  才能支撑落地弹卡和层数计算

## 2026-09-15（晚 5）

**01/02 页面细节定稿（用户反馈）**
- 结算前操作四按钮：一键收集行动 / 一键催交 / 关闭收行动 / AI 代收（可选）；
  "一键收集行动"理解为手动触发全量收集（区别于 AI 代收的自动定时），待用户确认语义
- 行动列表改组式两行制：一组=御主行+从者行，列=组别|代号|玩家QQ|行动原文|归类；
  QQ名列用途=GM 拉群
- 02 行动结算列表=单角色制：链序|职别|代号|玩家QQ|行动|结算结果；真名不显示
  （GM 手动翻找，一局只有真名猜测提交时用得到）
- 结算链逐步确认交互拍板（用户提议+AI 建议采纳）：走一步按一下，确认锁定、
  只能回退最近一环、空环节一键跳过、需裁决未清不许确认本环节、全确认才亮
  "推进下一时段"（衔接 engine advance 前置检查）；复用战斗表工序确认的交互先例；
  实现时需要把"环节确认进度"持久化（进库，不能只存前端）

## 2026-09-15（晚 4）

**次级页面草图补齐 8 张（gen-subpages.mjs 升级）**
- 骨架统一：所有页面带时间线 5 节点 + 三个入口按钮（及时结算/历史行动/灵脉），
  入口页打开时对应按钮深蓝 #74c0fc 标识当前页，流程页对应节点浅蓝 #a5d8fc(ACTIVE)
- 新增 06-及时结算（不耗行动即时结算流水+待确认队列）、07-历史行动（筛选+
  行列表+行展开详情+快照入口，数据源 action-records/rounds-history 现成）、
  08-灵脉（状态表+人流变动记录+补给分配+GM 编辑，leylines/assignments 现成）
- 8 张全部校验无坏元素；战役 tab 页面设计齐了，待用户确认后进战斗 tab 或开重构

## 2026-09-15（晚 3）

**时间线节点的规则映射定稿（依据 docs/行动规则总表.md，规则书 3.9 结算链）**
- 结算链：机动→魂食→干涉→解放→制造→信息→休整→摧毁工房；用户时间线是链的归并：
  行动结算=链上前段+解放(宝具结算在此)+袭击(触发战斗跳战斗表)；信息结算=信息类行动
  (广侦/调查/分析/真名)+广泛判定(判定单归此，不做独立入口)；魔力结算=变动对账；
  轮次结算=溢出移除+四补给
- "及时结算"入口的规则依据找到了：总表原文"不消耗行动力的行动在提交的当下立刻结算"
  （资料分析/真名猜测/转魔等），所以它不走流程、做成按需入口
- 图面更新：总览图两面板文字写明链归属+判定单候选撤除；02-行动结算页按链序重排示例
  （含袭击→跳战斗表动线）；03-信息结算页加四类信息行动（判定值/耗行动标注）+判定单流程
- 规则资产提醒：资料分析/真名猜测不耗行动=及时结算类；魂食四变体、休整二次判定等
  口径都在 docs/行动规则总表.md 第七节（已确认清单）

## 2026-09-15（晚 2）

**战役页信息架构定稿（用户拍板）**
- 时间线 5 步 = GM 按顺序处理的流程：结算前 → 行动结算 → 信息结算 → 魔力结算 → 轮次结算
- 及时结算 / 历史行动 = 按需查看的额外入口，不占流程；已做成浅蓝按钮放时间线底部（scripts/fix-timeline.mjs 整理，节点框与说明面板中心对齐、间距 90）
- 用户新增"角色状态"大面板（259,-938 820x243）：快速查角色人物卡/当前状态，
  数据源 /api/character-cards + /api/character-status 都现成
- AI 补充并已画入图：全局回合状态条（360,-1519，黑色实线正式元素）；
  4 个候选模块在画布下方蓝色虚线区（灵脉状态 / 判定单骰点 / QQ群绑定+未交名单 / AI收行动开关），等用户挑
- 用户的新需求三件套已定位：及时结算=实时流水（魔力结算页已改此设计）、
  历史行动=/api/action-records + /api/rounds/history 缺查询 UI、
  角色状态查询=两接口现成缺 UI

## 2026-09-15（晚）

**战役页 5 张次级页面草图生成（scripts/gen-subpages.mjs）**
- 用户指出要的是"节点点进去的完整子页面设计图"，不是总览图上的行内小面板；
  已生成 草图/战役次级页面/01~05（结算前/行动结算/信息结算/魔力结算/轮次结算）
- 统一框架：外层 1636x1026、导航 4 tab（战役高亮 #a5d8ff）、选择战役框、
  左侧时间线（当前节点高亮）、右侧速查 380x760 带内部结构
- 对齐网格：主区域 x=250 宽=840，区块间距 20~30，框内文字统一 (x+10,y+10)
- 每页内容：结算前（回合条/催交/行动列表/未交名单）、行动结算（顺序表/
  需裁决队列/推进按钮）、信息结算（全新模块：情报获取/暴露/手动添加）、
  魔力结算（变动表/.转魔申报/写回）、轮次结算（状态 diff/继承确认/快照历史）
- 教训沉淀：Excalidraw line 元素必须带 points 数组，缺了整文件 invalid file；
  生成器（gen-subpages.mjs）已内置，批量编辑脚本 tidy-sketch.mjs 也已修
- 下一环：用户打开草图逐页提修改/讲功能 → 定稿后按新结构重构前端

## 2026-09-15（下午）

**大重构立项：按用户 Excalidraw 草图重组整个前端（4 tab：战役/战斗/小工具/设置）**
- 用户画了 4 张草图（草图/*.excalidraw，同一画布的 4 个快照，原稿在 草图/备份/）：
  战役页（左侧流程时间线：结算前→行动/信息/魔力/轮次结算 + 右侧速查）、
  战斗页（横向六阶段步骤条 + 袭击方/被袭击方两大区 + 右侧速查）、
  小工具页（ai车卡 / ai宝具技能作成 / Q&A / 未完待续 四入口）、
  设置页（战役管理 / 角色卡管理 / 游戏版本管理 菜单+内容区）
- 用 scripts/tidy-sketch.mjs（Node 直改 .excalidraw JSON）完成：tab 摆正、速查统一
  380x760、补画子页面蓝虚线框（#1971c2 虚线=AI 补充，用户对着逐页讲功能）
- 踩坑（.excalidraw 批量编辑三条铁律）：
  1) 找框别用数量/尺寸猜，用"文字锚定+排除巨型外框(1636x1026)"；
  2) 同页多个相似框会连环误伤（设置 tab 框 x1086 被"x>1000 且宽>300"条件认成速查框）；
  3) 每次改前必须备份，改后逐项验证（外层框/tab/速查/蓝框数量）
- 功能盘点（explore agent 结果，重构映射用）：
  - 后端 14 个业务路由文件 + engine 三组路由（回合/战斗/AI agent）+ /api/kb 知识库
  - QQ 插件 fate-actions 实际 14 指令+ra 骰点 middleware，比 CLAUDE.md 记的多
    （公告/群管理/行动表 Excel 同步）；**插件源码本地已删**（NOTES 09-06 保密清理连带），
    只在 fate-三国杯-备份 zip 里；koishi.yml 的 apiBase 还指旧端口 8080（应 8100）
  - 前端 12 条路由（engine/engine-battle/skill-record 等文档没记全的都在）
- 待用户定：EnginePanel（判定单/群映射/催交）、AI agent、SkillRecord、
  SkillTemplateManage、SkillSubmissionConfirm、RuleAdvisor 归四个 tab 的哪个；
  新结构缺的模块（信息结算、游戏版本管理、Q&A、AI 车卡）按规划补

## 2026-09-15

**UI 协作流程定案：Excalidraw 草稿 → 读 JSON 还原代码（零视觉识别）**
- 用户不想让 AI"猜着画再改"，也不信任手绘拍照过视觉识别（会歪）；
  定下流程：用户在 excalidraw.com 画布局草稿 → 存 .excalidraw 文件进项目 →
  我直接读文件里的 JSON（每个元素有精确 x/y/宽高+文字标注）→ 按坐标还原代码
- 正向转换也打通了：页面渲染后用 Playwright evaluate 遍历 DOM 的
  getBoundingClientRect → 生成 Excalidraw 格式 JSON → 用户可在 excalidraw.com
  打开看现有页面布局底稿（首页已转：根目录 首页布局.excalidraw，26 个元素）
- 转换脚本要点：STRUCT 容器灰框/交互控件斜线填充框/直接文本转 text 元素；
  去重用完整 x/y/width/height 比对；全页尺寸容器跳过（无信息量）
- 踩坑：evaluate 返回值落盘会被包一层字符串编码，要 JSON.parse 两次
- 踩坑修复：EnginePanel.vue 里 `import('../../node_modules/node:sqlite')` 让 Vite
  import-analysis 报错，错误浮层挡住整站；@vite-ignore 直接写在字符串前无效
  （rolldown-vite 仍会分析），改成路径存变量 + @vite-ignore 才跳过
- 待办：用户确认 Excalidraw 打开效果 OK 后，可按需转其他页面（战斗表格更复杂）

## 2026-09-09（晚）

**QQ 技能提交收集链路（文字版）完成：解析+别名学习+段俗称+重复检测**
- 方案讨论定案：玩家发文字不走截图（OCR/视觉 API 全省了）；缩写不要求玩家写明白，
  用"别名表 + 自学习闭环"消化——GM 确认时顺手把新缩写存为别名，越用越准
- 玩家真实写法（GM 口述）：连写"魔境a抓火炮b"、俗称代段"空花丢群惩"、字母段位
  "神代魔术发d级"（a-e 段）、动词打头"开空花"；段分性质：大神殿=常驻段（开了就有）
  +爆发段（随发动），passive 段不参与选段
- 新增 backend-node/lib/skillSubmissionParser.js 纯规则解析器（零 token）：
  分隔符劈词 + 连写已知词最长扫描切分（"魔境a抓火炮b"→两条）+ 连接词清洗
  （抓/用/开/发…）+ 尾缀等级/段号/带圈数字/中文数字提取 + 三级匹配
  （别名精确→名字包含→顺序子序列，"空花"猜中"空中花园"）+ 段俗称匹配
  （模板 effects 每段 aliases 扫原文自动勾段）
- 歧义处理：多段模板（>=2 段）的尾缀字母 A-E 可能是段位不是等级，标 gradeAmbiguous，
  确认页给"转为第N段"一键翻转；独立"d级"字样明确是段位
- 新表：skill_alias（缩写→模板，campaign_id 空=全局）、skill_submission
  （原文+items_json+pending/confirmed/discarded+has_duplicate）；
  skill_template 加 max_uses_per_round（0=不限，魔境这类；注意 Number(0)||1 会吃掉 0）
- 新路由 /api/skill-submissions（preview 试解析/POST 入库/items 修正/confirm/
  discard/DELETE）：confirm 时重判重复（同人同回合同技能超上限→条目 duplicate+
  提交 has_duplicate，不自动拒，GM 裁决）+ 落 saveAliases 别名沉淀
- 新路由 /api/skill-aliases：列表/新增（同作用域同缩写覆盖旧指向）/删除
- 前端新页面 SkillSubmissionConfirm.vue（导航"提交确认"）：手动粘玩家消息+试解析、
  待确认队列（疑似重复红卡）、条目级段勾选（passive 段显示"常驻自动生效"）、
  未识别条目手选模板+候选置顶、记为别名勾选、已处理折叠、别名表管理
- 测试：test/smoke-skill-submission.mjs 六用例全绿（等级/连写/段俗称/d级段位/
  重复标记/别名沉淀）；浏览器实测确认链路+学习闭环（确认沉淀"神奇碎片"后，
  新提交直接别名命中+俗称勾段）
- **踩坑 1**：中文数字正则必须用字符类 [一二三四五六七八九十]，写成"一二三…九"
  连串会当整词匹配永远不中
- **踩坑 2**：连写切分后碎屑"a抓"的等级字母在词头，extractGrade 只剥词尾——
  handleGap 要先清洗连接词再识别；"发d级/开空花"同理要剥首尾动词
- **踩坑 3**：效果俗称"丢群惩"会被当技能名开 pending 条目——token 含段俗称词时
  挂当前条目对应段而不是开新条目（俗称词典按模板挂，条目须先定模板再挂段）
- 待办：Koishi 插件加"玩家消息转发到 /api/skill-submissions"（服务器侧，本地无
  plugins 目录）；确认后的 items 与战斗表/角色状态回写的联动还没接（确认数据先落库）
- 下一步可选：手动录入区接 QQ 消息自动同步；模板录入页给 effects 段加 label/aliases
  录入支持（现在靠 JSON）

## 2026-09-09

**战斗表结算链排序 + 发动统计 + 技能查文本/速查（GM 实测需求第一批）**
- 需求来源：9-8 带团战斗结算实测，GM 需要：1) 统计每人发了什么技能/宝具
  2) 按规则书 5.2 结算链排序 3) 点技能直接看原文 4) 王财/魔境抓的技能快速查询
- 新增 frontend/src/composables/settlementOrder.js：5.2 六条链常量唯一数据源
  （能力链/宝具类型链/技能类型链/等级链/时机链/效果链）+ 多级排序键
  （能力→类型→等级→名字）；未知类型/等级排链尾并打标记提醒 GM 补模板；
  "职阶=职介"、"对城宝具=对城"归一化；node --test 单测覆盖
- 模板库 np_type 字段（宝具子类型）：db.js ensureColumns 自动加列，
  normalizer/routes INSERT+UPDATE 同步；录入页 skillType 改标准化下拉
  （职介/天赋/技艺/祝福/荣冠/兵器/魔术/宝具/其他，旧自由文本自动追加兼容），
  选宝具时显示 npType 下拉（对人魔剑→…→对界 8 档）
- buildSkillQueue 条目补 abilityKind（按卡面列表来源直接定，不再靠猜）、
  skillType/npType（模板带入）、cardRawText（原文兜底）；御主卡工坊/礼装进队列
- applyQueueEffects：同一技能内效果按 5.2.1 链排序处理展示
  （轰击/即死→状态→属性→胜率→保底→魔力→文本），新增 kind
  bombard_instant_death / status_effect（暂走需裁决分支）
- 新组件：SettlementOrderPanel（侧栏，按人物分组统计已生效技能+组内按链排序，
  可切全局平铺看结算顺序）、SkillTextModal（原文三级兜底：模板原文→条目全文→整卡原文）、
  SkillLookupModal（头部"技能速查"按钮，同时搜模板库+本战役全部角色卡，纯查看不挂载）；
  SkillQueuePanel 行内加"原文"按钮和类型徽章
- **踩坑 1**：PowerShell 5.1 Invoke-RestMethod 发中文 JSON body 会编码成乱码，
  冒烟测试必须用 node fetch（test/smoke-np-type.mjs，FATE_GM_SMOKE_BASE 可改地址）
- **踩坑 2**：8100 被旧代码后端占着（PID 34600，昨日已记录），新代码测试请求
  打到旧进程导致 np_type 一直是 NULL、报错还看不出原因——用 PORT=8101 起新进程
  验证才通过。**用户重启后端后 np_type/新组件才生效**
- 第二批待办：QQ 截图收集链路（玩家发 Excel 截图→Koishi 插件转发→后端转存本地
  →视觉 API 只识别"技能名+等级"→模板库匹配带出原文→GM 页面确认挂角色）。
  视觉 API 建议先智谱 glm-4v-flash（免费），SiliconFlow 备选，OpenAI 兼容可切换；
  fate-actions 插件源码在服务器侧 Koishi 项目，本地仓库无 plugins 目录

## 2026-09-08（晚）

**引擎 v0.5-B 完成：AI 进引擎框架当操作员（收行动工作流）+ 全量消息日志**
- 背景：GM 实测轨 A（dsh+SOP）幻想需提醒、回复慢、爱写真名；拍板 B 方案——
  AI 当操作员，引擎 API 当框架（错误从"编造事实"变成"调错动作"，引擎校验兜底）
- 新增 engine/exitgate.mjs 出口闸：AI 外发文本确定性检查——目标渠道非私组直接拦；
  按角色卡表把真名（张角/曹植类）替换成单位键（术从/术御），GM 不用再手动翻译
- 新增 engine/qqws.mjs 消息采集器：旁听 NapCat 正向 WS（多客户端共存），
  群聊/私聊消息全量落 message_log；断线自动重连（5s 起步退避到 60s）
- 新增 engine/agent.mjs 收行动工作流：查各私组公告 → 按 从者/御主 前缀分段标准化
  （分段自动归 弓从/弓御 单位键）→ 纯规则成功直接登记 → 失败片段 LLM 兜底
  （DeepSeek，动词白名单校验，token 预算控制）→ 仍失败进需裁决 → 私组确认回执 →
  催未交；公告按内容 hash 幂等 + 登记 Level 查重，重复跑不重复登记不刷屏；
  公告头"第N天昼"自动识别回合/时段
- 新增 engine/agent-router.mjs（挂 /api/engine/agent/*）：run/config/logs/
  messages/status/collector-restart；配置存 agent_config KV 表，定时器
  （agentEnabled+间隔，最小 5 分钟）和消息监听随配置自动重装
- EnginePanel 右栏新增 AI 助手区：LLM 开关/token 预算/定时开关+间隔/NapCat WS
  地址/一键收行动/运行摘要（登记几条、跳重几条、裁决几条、LLM 几次几个 token）
- 三张新表：message_log（全量消息留痕，含玩家发言只进本地库）/ agent_log
  （AI 每步审计+token）/ agent_config
- 边界（程序级）：AI 不碰 advance（推进永远 GM 手按）；外发必过出口闸；
  审计全留痕；LLM 超预算自动停用兜底
- 测试：engine/e2e-agent.mjs 22/22 全绿（mock QQ 端口、关 LLM 纯离线）；
  /api/engine/agent 七端点冒烟通过
- **踩坑**：engineRouter.use(agentRouter.default) 挂载后路由 404——子路由器
  use() 不带路径时看到的是完整剩余路径 /agent/config，而内部注册的是 /config，
  匹配不上；修法 engineRouter.use('/agent', agentRouter.default)。battle 路由
  能通纯粹因为其路径自带 /battles 前缀，把这个坑盖住了
- 注意：本机 8100 有个旧代码 node 实例（PID 34600）在跑，要重启才有 agent 路由
- 下一步：真实带团试跑一键收行动；需裁决 AI 猜测建议（spec 预留字段）下一轮

## 2026-09-08（早）

**AI 工具层（轨 A）实测反馈：越跑越漂 + 真名泄露——GM 方向讨论中**
- 用户昨日实测 dsh/SOP 辅助结算：开头统计输出尚可，越到后面越漂（对话变长上下文
  退化，SOP 的"状态只信库"靠提示词撑不住全程）
- 关键痛点：AI 输出爱写真名而不是 QQ 名/代号，GM 得手动翻映射；本规则里真名=
  真名猜测机制核心（被猜中=敌方白拿全卡情报），泄露不只是麻烦，是游戏事故
- "一律用代号"已写在工具铁律提示词里（tools/fate-gm-tools/index.mjs:52），仍挡
  不住——印证引擎规格"提示词级约束 vs 程序级约束"的判断
- 用户列的 AI 用途（查未交/催行动/结算链排序/魔力提醒）引擎面板已全覆盖
  （公告检查 c8e5ece、结算链 M1、魔力台账对账）
- 待定方向：①AI 层若保留，加程序级"真名→代号"输出闸（按角色表确定性替换）；
  ②功能整体切引擎面板，AI 只留判例答疑（M4 现路线）

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

## 2026-09-08（收官）

**今日总账（11 个提交）**
- 完成项：SOP v0.3 → M0.5 行动规则总表 → M1 行动引擎 → M3 战斗引擎核心+状态机 → 独立战斗表页面 → MAA 风格引擎 exe（本机+分发版）→ 公告检查（NapCat HTTP 直连）→ LLM 离线丰富架构
- 待完善（优先级序）：1.战斗引擎实战校准（术vs枪双跑）2.M2 灵脉效果全录（效果类型驱动）3.技能模板库联动 4.fate-actions 恢复+QQ 三指令 5.面板新建战役按钮+口径导入导出 6.待确认口径：制裁机关/跨时段分配/介入细节
- 明天复盘：node tools/collect-test-log.mjs → 带日志来 → SOP 逐条验 + 账本对账 + 别名收编
