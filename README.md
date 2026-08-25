# Fate GM Helper

空想圣杯规则的 GM 辅助系统。目标是把战役管理、角色卡记录、行动提交、战斗表计算、状态同步这些重复工作自动化，让 GM 更容易开团。

本项目按本地/私有工具设计，不准备挂公网；核心体验是启动后在本机独立窗口使用，也保留浏览器访问方式。

## 当前状态
- 前端：Vue 3 + Vite，包含首页、战役控制台、角色卡上传/检索、战斗表页面、技能模板库。
- 主后端：`backend-node`，Express + SQLite（better-sqlite3），提供 `/api` 接口并可托管前端构建产物。
- 旧版后端：`backend` 保留 Spring Boot + JPA + MySQL 实现作为参考，不再作为当前轻量部署主线。
- QQ 机器人：Koishi 插件 `fate-actions`，支持绑定战役、从者行动、御主行动。

## 已有主要功能
- 战役创建、选择、删除。
- .st 角色卡解析、保存、检索、删除、退场/重新登场。
- 灵脉创建、编辑、删除和分配。
- 回合管理：当前回合、下一回合、关闭回合、历史快照。
- 行动提交：Web/QQ 提交，Web 端通过 SSE 实时接收。
- 角色状态：魔力、令咒、异常状态等按战役/回合保存。
- 战斗表：参战位选择、属性合计、辅助减半、技能勾选、战术克制、魔力不足、基础/最终胜率计算、主要工序摘要、工序确认/撤回（撤回会联动后续工序）、结算确认锁定、双方魔力和明确结构化状态效果回写；页面已按编队、工序、结算、复盘拆成子组件。
- 技能模板库：可录入结构化技能效果，并在战斗表中按技能名匹配、套用简单属性/胜率补正。

## 尚未完成
- 战斗表还没有完整覆盖初始工序、主要工序、最终工序。
- 战斗表后续应以双方都选择角色卡为主；手动输入敌人只作为临时 fallback。
- QQ 群绑定已经持久化；后续重点是复盘、状态联动和判例系统。
- 战斗记录快照已有基础能力，后续还需要补强展示和搜索。
- 技能模板只自动处理简单数值效果，复杂条件仍需 GM 手动裁决。
- Q&A 判例系统和 AI 规则助手尚未实现。

## 启动提示
### 项目定位
这是本地/私有工具，默认只在自己的电脑或局域网里使用，不按云端公网系统设计。

因此优先保证：一键启动、SQLite 数据不丢、备份方便、错误提示清楚。

### 本地独立窗口启动（推荐）
Windows 下双击：

```text
start-desktop.bat
```

脚本会先构建前端、启动轻量后端，再用 Edge/Chrome 的 app 模式打开独立窗口。这个窗口本质上还是本地网页壳，但看起来更像桌面应用，不需要额外安装 Electron。

### 本地浏览器启动
如果只想启动服务，然后自己打开浏览器，也可以双击：

```text
start-local.bat
```

脚本会先构建前端，再启动轻量后端。启动后访问：

```text
http://localhost:8100
```

这个项目按本地/私有工具设计，不需要挂公网。

### 前端开发模式
```bash
cd frontend
npm install
npm run dev
```

### 轻量后端（当前主线）
```bash
cd backend-node
npm install
npm run dev
```

默认 SQLite 文件：

```text
backend-node/data/gm_helper.db
```

手动备份数据库：

```bash
npm run backup
```

备份文件默认保存到：

```text
backend-node/backups/gm_helper-日期-时间.db
```

如果你把数据库放到了自定义位置，备份脚本也会读取同一个 `FATE_GM_DB_PATH`。

如果想把数据库放到 Koishi 项目旁边或服务器统一数据目录，可以设置环境变量：

```bash
FATE_GM_DB_PATH="C:/path/to/gm_helper.db" npm start
```

### 生产模式
```bash
cd frontend
npm run build
cd ../backend-node
npm start
```

然后访问 `http://localhost:8100`。

前端默认使用同源 `/api` 访问后端；开发模式下 Vite 会把 `/api` 代理到 `http://localhost:8100`。

### Spring Boot 旧版后端
`backend` 目录保留旧版 Spring Boot + MySQL 代码，主要作为迁移参考；当前轻量部署优先使用 `backend-node`。

### Koishi 插件
插件位于：

```text
my-koishi-bot/plugins/fate-actions
```

插件默认连接：`http://localhost:8100/api`。如果 Koishi 和本工具不在同一台机器上，把插件配置里的 API 基地址改成局域网地址即可。

QQ 群绑定战役已经写入本地 SQLite，Koishi 重启后仍会从后端查询当前绑定。

### NapCat / QQ 接入
本仓库不内置 NapCat 本体。NapCat 需要单独下载并登录 QQ，本项目只提供接入说明和示例配置：

```text
tools/napcat/README.md
tools/napcat/onebot.example.json
```

推荐把 NapCat 放到 `tools/napcat/runtime/`，该目录已被 Git 忽略，避免误传登录数据和 token。

QQ 消息链路：NapCat 登录 QQ → Koishi adapter-onebot → `fate-actions` 插件 → `http://localhost:8100/api` → SQLite。

主要指令：
- `绑定战役 <战役ID>`
- `从者行动 <阶职> <行动内容>`
- `御主行动 <阶职> <行动内容>`

## 开发规划
详细规划见 `CLAUDE.md`。
