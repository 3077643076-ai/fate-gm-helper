# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是为"空想圣杯"TRPG跑团规则开发的GM辅助系统。目标是让GM通过网页端管理战役，玩家通过QQ群提交行动指令。

## 技术栈与启动

| 组件 | 技术 | 启动方式 |
|------|------|----------|
| `backend/` | Spring Boot 3.3.5 + JPA + MySQL + Java 17 | `cd backend && mvnw.cmd spring-boot:run`（端口8080） |
| `frontend/` | Vue 3 + Vue Router + Vite | `cd frontend && npm run dev`（端口5173，自动代理`/api`到后端） |
| `my-koishi-bot/` | Koishi 框架 + TypeScript | 在项目根使用 `koishi start` 或通过 Koishi 控制台启动（端口5140） |

也可以直接在项目根运行 `start-all.ps1` 一键启动前后端。

后端需要 MySQL 数据库 `GmHelper`，配置在 `backend/src/main/resources/application.yml` 中。`ddl-auto=update` 会在启动时自动建表，无需手动执行SQL。

## 项目架构

```
QQ群玩家 ──→ Koishi机器人 ──→ 后端API ──→ MySQL数据库
                                    │
                                    ├── SSE推送 ──→ 前端网页（实时更新）
                                    │
                              GM浏览器 ──→ 前端网页（管理界面）
```

### 后端分层（`backend/src/main/java/com/fategmhelper/backend/`）

- **`domain/`** — JPA实体类，对应数据库表
- **`repository/`** — Spring Data JPA接口，操作数据库
- **`service/`** — 业务逻辑层
- **`web/`** — REST控制器（`*Controller.java`）和请求/响应DTO
- **`config/`** — CORS等全局配置

### 核心实体关系

- `Campaign`（战役）是所有数据的顶层容器
- `Round`（回合）关联到战役，状态为 OPEN/CLOSED。提交行动时如果当前没有开放回合，会**自动创建下一回合**（见 `RoundService.getOrCreateCurrentRound`）
- `ActionSubmission`（行动提交）关联到回合和战役，分 SERVANT_ACTION（从者行动）和 MASTER_ACTION（御主行动）。同一回合内同一阶职+同一行动类型的新提交会**覆盖旧记录**（旧记录标记为非current）
- `Leyline`（灵脉）关联到战役，有魔力量、战场宽度、人流量等属性
- `CharacterCard`（角色卡）和 `CharacterStatus`（角色状态）也关联到战役

### 数据流核心路径

1. **QQ提交行动**：玩家在QQ群发送 `从者行动 剑 攻击敌方` → Koishi `fate-actions` 插件解析指令 → `POST /api/action-submissions` → `ActionSubmissionService.submitAction()` → 存入 `action_submission` 表 → 通过Spring事件机制发布 → `ActionSubmissionSseController` 通过SSE推送到前端
2. **前端展示**：前端页面调用 `GET /api/action-submissions?campaignId=X` 获取当前回合所有行动，同时通过 `/api/action-submissions/stream?campaignId=X` 建立SSE长连接接收实时推送

### Koishi 插件（`my-koishi-bot/plugins/fate-actions/src/index.ts`）

提供三个QQ群指令：
- `绑定战役 <ID>` — 将QQ群绑定到战役（存储在内存Map中，重启丢失）
- `从者行动 <阶职> <内容>` — 提交从者行动
- `御主行动 <阶职> <内容>` — 提交御主行动

阶职支持中英文输入（如"剑"/"Saber"均可），会自动转换为中文单字存储。

### 前端页面路由

- `/` — 首页
- `/battle-control/:campaignId?` — 战斗控制面板（核心页面）
- `/character-card-upload/:campaignId?` — 角色卡上传
- `/battle-sheet` — 战斗表
- `/skill-record` — 技能记录

前端通过 Vite 开发服务器的 proxy 配置将 `/api` 请求代理到 `localhost:8080`，无需在服务层硬编码后端地址。

### `html/` 目录

包含独立的纯HTML静态页面（BattleSheet、CharacterCardUpload、DashboardCampaign、SkillRecord、battlecontrol），是Vue前端之前的原型版本，可以忽略。

## 注意事项

- 配置文件（`config.json`、`settings.json`、`application.yml`）中包含API密钥和数据库密码，**不要提交到公开仓库**
- Koishi 的战役绑定存储在内存中，机器人重启后会丢失，需要重新绑定
- 后端在 Windows 上开发，使用 `mvnw.cmd` 而非 `./mvnw`
