# 本机持久化与迁移恢复设计

## 背景

本项目是本机 GM 辅助工具，不准备部署到公网服务器。浏览器只是前端显示和操作入口；Node + SQLite 后端负责保存数据；QQ 输入通过 NapCat/Koishi 接入即可。

本设计的目标不是做服务器部署，而是保证：电脑关机后，下一次开机重新启动项目，之前的跑团数据仍然可用；后续从当前电脑迁移到用户自己的电脑时，也能按简单步骤恢复。

## 目标

- 保持 `backend-node` 作为主线后端。
- 保持 SQLite 本地数据库作为唯一主要持久化来源。
- 保证战役、回合、角色卡、角色状态、灵脉、行动提交、战斗表、技能模板在重启后仍可读取。
- 启动脚本和说明面向本机使用，不依赖当前电脑的绝对路径。
- 新电脑迁移时，只需移动项目代码和数据库文件，并重新安装依赖即可继续使用。
- 数据库文件用于本机备份/迁移，不应提交到 Git 仓库。

## 非目标

- 不做公网部署方案。
- 不做公网鉴权、用户权限、多用户隔离。
- 不做复杂自动备份系统。
- 不做多设备同步。
- 不把旧 Spring Boot 后端作为日常启动目标。

## 当前判断

`backend-node/db.js` 当前使用：

- `FATE_GM_DB_PATH` 环境变量优先。
- 未配置时默认 `backend-node/data/gm_helper.db`。
- `CREATE TABLE IF NOT EXISTS` 初始化表。
- `ensureColumns()` 补齐旧库缺少字段。

这个方向基本符合本机持久化需求。设计上要避免未来引入会清空、覆盖或迁移失败后损坏旧数据的启动逻辑。

## 数据边界

### 主数据库

默认数据库文件：

```text
backend-node/data/gm_helper.db
```

同目录下可能出现 SQLite WAL 文件：

```text
backend-node/data/gm_helper.db-wal
backend-node/data/gm_helper.db-shm
```

日常运行时不要删除这些文件。迁移电脑时，最稳妥做法是在后端完全停止后复制整个 `backend-node/data` 目录。

### 应恢复的数据

重启后至少应恢复：

- 战役：`campaign`
- 当前/历史回合：`campaign_round`、`action_history`
- 行动提交：`action_submission`
- 角色卡：`character_card`
- 角色状态：`character_status`
- 灵脉和分配：`leyline`、`leyline_assignment`
- 战斗表：`battle_sheet`
- 技能模板：`skill_template`
- 当前选择战役等设置：`app_settings`

## 启动设计

### 日常本机启动

推荐保留一个本机启动入口，例如 `start-all.ps1`，但它应满足：

- 使用脚本所在目录作为项目根目录。
- 启动 `backend-node`，不是旧 `backend` Spring Boot。
- 启动 `frontend` Vite 开发服务。
- 不写死 `X:\...` 这类当前电脑路径。
- 不删除 `backend-node/data`。

QQbot/NapCat 可以作为附加入口，不应该影响浏览器主流程启动。

### 前端 API 地址

因为项目只在本机使用，`localhost:8080` 可以接受。但为减少未来维护成本，前端服务层最好集中读取同一个 API 基址，而不是每个 service 文件各写一遍。

可接受方案：

```text
默认 API = http://localhost:8080/api
```

后续如需迁移目录或端口，只改一个地方。

## 迁移到自己电脑

### 需要带走

- 整个项目目录 `fate-gm-helper`。
- 尤其是 `backend-node/data` 目录。
- 如果继续使用 QQbot，则带走 `my-koishi-bot` 配置和插件代码。

### 不建议直接依赖搬走

- `node_modules`：体积大，且可能和新电脑 Node 环境不匹配。
- NapCat/QQ 登录状态：新电脑通常重新登录更稳。

### 新电脑恢复步骤

1. 安装 Node.js。
2. 复制整个项目目录到新电脑。
3. 确认 `backend-node/data/gm_helper.db` 存在。
4. 在 `backend-node` 重新安装依赖：`npm install`。
5. 在 `frontend` 重新安装依赖：`npm install`。
6. 启动后端和前端。
7. 打开浏览器检查旧战役、角色卡、回合、战斗表是否存在。
8. 如使用 QQbot，再配置 NapCat/Koishi 连接。

## 验证流程

实现或调整启动说明后，用下面流程验证：

1. 启动 Node 后端和前端。
2. 创建测试战役。
3. 保存一张角色卡。
4. 创建或推进一回合。
5. 保存一条行动或战斗表。
6. 保存一个技能模板。
7. 停止前端和后端。
8. 重新启动项目。
9. 检查第 2-6 步数据是否仍在。
10. 再复制 `backend-node/data` 到临时目录，确认数据库文件可被备份。

## 风险和处理

### 风险：启动脚本写死旧路径

当前 `start-all.ps1` 指向旧 Spring Boot 和旧绝对路径。需要改成本机相对路径启动 Node 后端和前端。

### 风险：用户误删数据库

不做复杂自动备份，但 README 应明确：`backend-node/data/gm_helper.db` 是核心数据文件，移动电脑或备份时必须保留。

### 风险：数据库路径变化导致“看起来数据丢了”

如果未来使用 `FATE_GM_DB_PATH`，README 必须说明当前实际数据库位置。否则用户可能启动到一个新空库，以为旧数据丢失。

### 风险：依赖搬家失败

新电脑不要直接相信旧 `node_modules`，应重新安装依赖。特别是 `better-sqlite3` 这类原生依赖。

## 后续实施建议

P0：

- 修改 `start-all.ps1` 为相对路径启动 `backend-node` 和 `frontend`。
- 补 README 的本机启动和迁移说明。
- 明确 `backend-node/data/gm_helper.db` 是核心数据文件。

P1：

- 前端集中 API 基址，默认仍是 `http://localhost:8080/api`。
- 补一个手动验证清单，覆盖重启恢复。

P2：

- 如果以后真的担心误删，再加手动备份脚本；当前不是必须。
