# Fate GM Helper Backend (Spring Boot Legacy)

这个目录保留 Spring Boot + JPA + MySQL 旧版后端代码，主要用于参考和迁移对照。

当前项目主线已经切换到：

```text
backend-node = Node.js + Express + SQLite（better-sqlite3）
```

## 当前建议
- 新功能优先写 `backend-node`。
- SQLite 默认数据库文件为 `backend-node/data/gm_helper.db`。
- 可用 `FATE_GM_DB_PATH` 指定数据库位置，方便和 Koishi 项目相邻部署。
- 不建议继续为当前轻量部署新增 Spring Boot / MySQL 功能。

## 如果仍要运行旧版
需要 JDK 17+、MySQL 8.0。

```bash
cd backend
./mvnw.cmd spring-boot:run
```

配置文件：

```text
backend/src/main/resources/application.yml
```

如果本机 `JAVA_HOME` 仍指向 Java 8 或无效路径，Spring Boot 3 项目无法编译运行。

## 旧版接口模块
- `/api/campaigns`：战役管理、当前选择战役。
- `/api/character-cards`：角色卡保存、检索、删除、退场/重新登场。
- `/api/leylines`：灵脉管理。
- `/api/leyline-assignments`：灵脉分配。
- `/api/rounds`：当前回合、下一回合、关闭回合、历史快照。
- `/api/action-submissions`：行动提交和当前回合行动列表。
- `/api/action-submissions/stream`：SSE 行动实时推送。
- `/api/character-status`：角色状态保存和查询。
- `/api/battle-sheets`：战斗表创建、读取、保存、删除。
