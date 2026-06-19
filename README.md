# Fate GM Helper — 空想圣杯 TRPG GM 辅助系统

让看完规则书的人都能舒服地开团。GM 通过网页管理战役，玩家通过 QQ 群提交行动指令，实时同步。

## 架构

```
QQ群玩家 ──→ Koishi 机器人 ──→ 后端 API ──→ MySQL 数据库
                                    │
                              SSE 推送 ──→ 前端网页（实时更新）
                                    │
                              GM 浏览器 ──→ 管理界面
```

## 技术栈

| 层 | 技术 |
|------|------|
| 前端 | Vue 3 + Vue Router + Vite |
| 后端 | Spring Boot 3.3 + JPA + MySQL |
| 机器人 | Koishi + TypeScript + NapCat（QQ） |
| 实时推送 | SSE（Server-Sent Events） |

## 快速开始

### 环境要求

- Java 17+
- Node.js 20+
- MySQL 8.0+
- [NapCat](https://github.com/NapNeko/NapCatQQ)（QQ 登录端）

### 1. 数据库

创建 MySQL 数据库 `GmHelper`，后端启动时会自动建表（`ddl-auto=update`）。

### 2. 后端

```bash
cd backend
# 编辑 src/main/resources/application.yml，填写数据库密码
mvnw.cmd spring-boot:run     # Windows
# ./mvnw spring-boot:run     # macOS / Linux
```

默认端口 `8080`。

### 3. 前端

```bash
cd frontend
npm install
npm run dev
```

默认端口 `5173`，`/api` 请求自动代理到后端 `8080`。

### 4. QQ 机器人

```bash
cd my-koishi-bot
npm install
# 配置 koishi.yml 中的 QQ 号和 NapCat token
npm run dev
```

默认端口 `5140`。

### 5. 一键启动

也可以直接运行 `start-all.ps1`（Windows PowerShell）。

## 项目结构

```
fate-gm-helper/
├── backend/                     # Spring Boot 后端
│   └── src/main/java/.../backend/
│       ├── domain/              # JPA 实体（数据表）
│       ├── repository/          # 数据库操作
│       ├── service/             # 业务逻辑
│       ├── web/                 # REST 控制器 + DTO
│       └── config/              # CORS 等配置
├── frontend/                    # Vue 3 前端
│   └── src/
│       ├── views/               # 页面组件
│       ├── components/          # 通用组件
│       ├── composables/         # 组合式函数
│       ├── services/            # API 请求封装
│       └── router/              # 路由配置
├── my-koishi-bot/               # QQ 机器人
│   └── plugins/fate-actions/    # 行动提交插件
├── docs/                        # 文档
└── start-all.ps1                # 一键启动脚本
```

## QQ 指令

| 指令 | 说明 |
|------|------|
| `绑定战役 <ID>` | 将 QQ 群绑定到战役 |
| `从者行动 <阶职> <内容>` | 提交从者行动（如：`从者行动 剑 攻击敌方Caster`） |
| `御主行动 <阶职> <内容>` | 提交御主行动（如：`御主行动 Archer 使用令咒`） |

阶职支持中英文输入（"剑"/"Saber" 均可），自动转换为中文存储。

## 核心概念

- **战役（Campaign）** — 所有数据的顶层容器
- **回合（Round）** — 提交行动时若无开放回合，自动创建下一回合
- **行动提交（ActionSubmission）** — 同一回合内同阶职+同类型的新提交会覆盖旧记录
- **灵脉（Leyline）** — 魔力量、战场宽度、人流量等属性

## 许可

MIT
