# 本机持久化与迁移恢复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Fate GM Helper 作为纯本机工具可稳定启动、关机后重启恢复数据，并能迁移到用户自己的电脑继续使用。

**Architecture:** 保持 `backend-node` + SQLite 为主线持久化方案，不引入服务器部署或复杂备份。改造本机启动入口、文档和前端 API 基址集中化，保证代码搬到新电脑后只需复制数据库并重新安装依赖即可恢复。

**Tech Stack:** Node.js, Express, better-sqlite3, Vue 3, Vite, PowerShell, SQLite WAL.

## Global Constraints

- 项目只面向纯本机使用，不做公网部署。
- QQ 输入通过 NapCat/Koishi 接入，是附加输入口，不阻塞浏览器主流程。
- 主线后端是 `backend-node`，旧 `backend` Spring Boot 只作迁移参考。
- 主数据库默认是 `backend-node/data/gm_helper.db`。
- 数据库文件用于本机备份/迁移，不应提交到 Git 仓库。
- 启动脚本不能写死当前电脑的绝对路径。
- 不实现复杂自动备份、多用户权限、多设备同步。

---

## File Structure

- Modify: `start-all.ps1`
  - Responsibility: 本机一键启动 Node 后端和 Vite 前端；使用相对路径；不触碰数据库文件。
- Modify: `README.md`
  - Responsibility: 说明本机启动、核心数据库位置、新电脑迁移步骤、Koishi/NapCat 是可选入口。
- Create: `frontend/src/services/requestUtil.js`
  - Responsibility: 集中提供 `API_BASE` 和 `request(url, options)`，默认 `http://localhost:8080/api`。
- Modify: `frontend/src/services/*.js`
  - Responsibility: 删除重复 `API_BASE/request`，统一从 `requestUtil.js` 导入。
- Modify: `frontend/src/views/BattleControl.vue`
  - Responsibility: SSE 使用统一 `API_BASE`，声明并清理 `actionEventSource`；去掉未定义的 `progress` 写入。
- Create: `docs/local-persistence-checklist.md`
  - Responsibility: 手动验证“关机重启不丢数据”和“迁移电脑”流程。

---

### Task 1: 本机相对路径启动脚本

**Files:**
- Modify: `start-all.ps1`

**Interfaces:**
- Consumes: `backend-node/package.json` scripts: `npm run dev`
- Consumes: `frontend/package.json` scripts: `npm run dev`
- Produces: A root-level PowerShell script that starts backend and frontend from the project root without absolute paths.

- [ ] **Step 1: Read current script**

Read `start-all.ps1` and confirm it currently starts old Spring Boot with an absolute path.

Expected current pattern:

```powershell
cd 'X:\dev\dev\fate-gm-helper\backend'; .\mvnw.cmd spring-boot:run
cd "X:\dev\dev\fate-gm-helper\frontend"; npm run dev
```

- [ ] **Step 2: Replace script content**

Replace the entire file with:

```powershell
# 本机一键启动 Fate GM Helper
# 在项目根目录双击/运行本脚本即可。
# 数据库默认保存在 backend-node/data/gm_helper.db，本脚本不会删除或覆盖数据。

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $projectRoot 'backend-node'
$frontendDir = Join-Path $projectRoot 'frontend'

if (-not (Test-Path $backendDir)) {
  Write-Error "找不到 backend-node 目录：$backendDir"
  exit 1
}

if (-not (Test-Path $frontendDir)) {
  Write-Error "找不到 frontend 目录：$frontendDir"
  exit 1
}

Start-Process powershell -ArgumentList @(
  '-NoExit',
  '-Command',
  "cd '$backendDir'; npm run dev"
)

Start-Process powershell -ArgumentList @(
  '-NoExit',
  '-Command',
  "cd '$frontendDir'; npm run dev"
)

Write-Host '已启动后端和前端窗口。'
Write-Host '后端默认地址：http://localhost:8080'
Write-Host '前端默认地址通常是：http://localhost:5173'
Write-Host '核心数据库：backend-node/data/gm_helper.db'
```

- [ ] **Step 3: Verify script no longer references old backend or absolute path**

Run:

```bash
grep -n "X:\\|spring-boot|mvnw|backend'" start-all.ps1 || true
```

Expected: no output containing old absolute path, `spring-boot`, or `mvnw`.

- [ ] **Step 4: Verify script references current components**

Run:

```bash
grep -n "backend-node\|frontend\|gm_helper.db\|npm run dev" start-all.ps1
```

Expected: output includes `backend-node`, `frontend`, `gm_helper.db`, and two `npm run dev` commands.

- [ ] **Step 5: Commit**

```bash
git add start-all.ps1
git commit -m "chore: use local Node startup script"
```

---

### Task 2: README 本机启动与迁移说明

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: startup behavior from Task 1.
- Produces: Human-readable local startup and migration instructions.

- [ ] **Step 1: Update startup section**

In `README.md`, replace the existing `## 启动提示` section with:

```markdown
## 本机启动

本项目按“本机 GM 工具”使用，不需要挂公网服务器。浏览器只是前端显示和操作入口；数据由本机 Node 后端写入 SQLite。

### 一键启动（推荐）

在项目根目录运行：

```powershell
.\start-all.ps1
```

脚本会分别打开：

- 后端：`backend-node`，默认地址 `http://localhost:8080`
- 前端：`frontend`，默认地址通常是 `http://localhost:5173`

### 手动启动

后端：

```bash
cd backend-node
npm install
npm run dev
```

前端：

```bash
cd frontend
npm install
npm run dev
```

默认 SQLite 文件：

```text
backend-node/data/gm_helper.db
```

同目录可能出现：

```text
backend-node/data/gm_helper.db-wal
backend-node/data/gm_helper.db-shm
```

这些都是本机数据相关文件。运行时不要删除 `backend-node/data`。

如果确实想指定数据库位置，可以设置环境变量：

```bash
FATE_GM_DB_PATH="C:/path/to/gm_helper.db" npm start
```

如果设置了 `FATE_GM_DB_PATH`，请记住实际数据库位置，避免下次启动到一个新的空库。
```

- [ ] **Step 2: Add migration section before `## 开发规划`**

Insert this section before `## 开发规划`:

```markdown
## 换电脑迁移

迁移到自己的电脑时，建议这样做：

1. 在旧电脑停止后端和前端。
2. 复制整个 `fate-gm-helper` 项目目录。
3. 重点确认 `backend-node/data/gm_helper.db` 已被复制。
4. 如果存在 `gm_helper.db-wal`、`gm_helper.db-shm`，也一起复制；最简单是复制整个 `backend-node/data` 目录。
5. 在新电脑安装 Node.js。
6. 在 `backend-node` 运行 `npm install`。
7. 在 `frontend` 运行 `npm install`。
8. 运行 `./start-all.ps1` 或分别启动后端和前端。
9. 打开浏览器检查旧战役、角色卡、回合、战斗表、技能模板是否还在。

不建议直接依赖搬运旧 `node_modules`，因为新电脑环境可能不一致。`better-sqlite3` 是原生依赖，重新安装更稳。

QQbot / NapCat 是附加输入口。换电脑后通常重新登录或重新配置 NapCat/Koishi 更稳，不影响浏览器本体继续使用。
```

- [ ] **Step 3: Keep old backend note**

Ensure README still contains this sentence under a Spring Boot note:

```markdown
`backend` 目录保留旧版 Spring Boot + MySQL 代码，主要作为迁移参考；当前日常使用优先启动 `backend-node`。
```

- [ ] **Step 4: Verify README mentions required persistence facts**

Run:

```bash
grep -n "本机 GM 工具\|backend-node/data/gm_helper.db\|gm_helper.db-wal\|换电脑迁移\|better-sqlite3\|NapCat" README.md
```

Expected: each keyword appears at least once.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document local persistence workflow"
```

---

### Task 3: 前端 API 基址集中化

**Files:**
- Create: `frontend/src/services/requestUtil.js`
- Modify: `frontend/src/services/actionSubmission.js`
- Modify: `frontend/src/services/battleSheet.js`
- Modify: `frontend/src/services/campaign.js`
- Modify: `frontend/src/services/characterCard.js`
- Modify: `frontend/src/services/characterStatus.js`
- Modify: `frontend/src/services/leyline.js`
- Modify: `frontend/src/services/leylineAssignment.js`
- Modify: `frontend/src/services/round.js`
- Modify: `frontend/src/services/skillTemplate.js`

**Interfaces:**
- Produces: `API_BASE: string`
- Produces: `request(url: string, options?: RequestInit): Promise<any>`
- Consumes: existing service functions keep their exported names and parameters unchanged.

- [ ] **Step 1: Create shared request util**

Create `frontend/src/services/requestUtil.js`:

```js
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080/api'

export async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `请求失败：${res.status}`)
  }

  const contentType = res.headers.get('content-type')
  const contentLength = res.headers.get('content-length')

  if (contentLength === '0' || (contentType && !contentType.includes('application/json'))) {
    return null
  }

  const text = await res.text()
  if (!text || text.trim() === '') {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Update service modules to import util**

For each API service file listed in this task:

Remove local definitions like:

```js
const API_BASE = 'http://localhost:8080/api'

async function request(url, options = {}) {
  // duplicated fetch code
}
```

Add at the top:

```js
import { API_BASE, request } from './requestUtil'
```

For `frontend/src/services/leylineAssignment.js`, replace its current top lines:

```js
const API_BASE = 'http://localhost:8080/api'
import { request } from './requestUtil'
```

with:

```js
import { API_BASE, request } from './requestUtil'
```

Do not rename any exported functions.

- [ ] **Step 3: Verify no service has duplicated API base**

Run:

```bash
grep -R "const API_BASE = 'http://localhost:8080/api'\|const API_BASE = \"http://localhost:8080/api\"" frontend/src/services || true
```

Expected: no output.

- [ ] **Step 4: Verify service imports**

Run:

```bash
grep -R "from './requestUtil'" frontend/src/services
```

Expected: output includes all API service files except `statusEffects.js` and `requestUtil.js`.

- [ ] **Step 5: Run frontend build**

Run:

```bash
cd frontend && npm run build
```

Expected: build exits with code 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/services
git commit -m "refactor: centralize frontend API client"
```

---

### Task 4: BattleControl SSE 和未定义状态修复

**Files:**
- Modify: `frontend/src/views/BattleControl.vue`

**Interfaces:**
- Consumes: `API_BASE` from `frontend/src/services/requestUtil.js`
- Consumes: `connectActionSSE()` local function.
- Produces: `actionEventSource` lifecycle that opens on selected campaign and closes on unmount.

- [ ] **Step 1: Import API_BASE**

In `BattleControl.vue`, add this import near other service imports:

```js
import { API_BASE } from '../services/requestUtil'
```

- [ ] **Step 2: Declare actionEventSource**

After route/router setup:

```js
const route = useRoute()
const router = useRouter()
```

add:

```js
let actionEventSource = null
```

- [ ] **Step 3: Remove undefined progress write**

In `nextTurn()`, remove this line:

```js
progress.value = progressPercent.value
```

Do not replace it with another state update unless `progress` is explicitly declared elsewhere.

- [ ] **Step 4: Ensure SSE connects after campaign load**

Find the code path that selects or loads a campaign in `loadCampaigns()` or the campaign selection function. After `campaignId.value` has been set and current campaign data has loaded, call:

```js
connectActionSSE()
```

If there is already a comment saying `loadCampaigns will call connectActionSSE`, make the code match the comment.

- [ ] **Step 5: Close SSE on unmount**

Replace the current unmount SSE comment:

```js
// no-op: using manual refresh for submissions
```

with:

```js
if (actionEventSource) {
  try { actionEventSource.close() } catch (e) {}
  actionEventSource = null
}
```

- [ ] **Step 6: Run frontend build**

Run:

```bash
cd frontend && npm run build
```

Expected: build exits with code 0.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/views/BattleControl.vue
git commit -m "fix: restore local action submission SSE"
```

---

### Task 5: 手动重启恢复检查清单

**Files:**
- Create: `docs/local-persistence-checklist.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: persistence design from `docs/superpowers/specs/2026-07-31-local-persistence-migration-design.md`
- Produces: checklist that a non-expert user can follow before moving computers.

- [ ] **Step 1: Create checklist file**

Create `docs/local-persistence-checklist.md`:

```markdown
# 本机数据持久化检查清单

用于确认：电脑关机后重新启动项目，跑团数据仍然存在；迁移到新电脑时能恢复。

## 重启恢复检查

1. 启动项目：运行根目录 `start-all.ps1`。
2. 打开前端页面。
3. 创建一个测试战役，名称例如 `持久化测试战役`。
4. 上传或保存一张测试角色卡。
5. 创建或推进一回合。
6. 保存一条行动提交，或保存一张战斗表。
7. 保存一个技能模板。
8. 关闭浏览器。
9. 停止后端和前端 PowerShell 窗口。
10. 重新运行 `start-all.ps1`。
11. 打开前端页面。
12. 检查测试战役、角色卡、回合、行动/战斗表、技能模板是否仍然存在。

## 换电脑前检查

1. 停止后端和前端。
2. 确认存在：`backend-node/data/gm_helper.db`。
3. 如果存在下面两个文件，也一起保留：
   - `backend-node/data/gm_helper.db-wal`
   - `backend-node/data/gm_helper.db-shm`
4. 复制整个项目目录，或至少复制代码目录加 `backend-node/data`。
5. 新电脑重新安装 Node.js。
6. 在 `backend-node` 执行 `npm install`。
7. 在 `frontend` 执行 `npm install`。
8. 运行 `start-all.ps1`。
9. 打开浏览器确认旧数据还在。

## 不要做

- 不要删除 `backend-node/data`。
- 不要把 `gm_helper.db` 当作普通缓存文件清理。
- 不要依赖直接搬运旧 `node_modules`。
- 不要把数据库文件提交到公开 Git 仓库。
```

- [ ] **Step 2: Link checklist from README**

In `README.md`, after the migration section, add:

```markdown
详细检查步骤见：`docs/local-persistence-checklist.md`。
```

- [ ] **Step 3: Verify docs mention database and checklist**

Run:

```bash
grep -n "local-persistence-checklist\|backend-node/data/gm_helper.db" README.md docs/local-persistence-checklist.md
```

Expected: both files contain relevant matches.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/local-persistence-checklist.md
git commit -m "docs: add local persistence checklist"
```

---

### Task 6: Final verification

**Files:**
- No new modifications unless verification exposes a bug.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified local startup/migration readiness evidence.

- [ ] **Step 1: Check no old startup references remain in root script**

Run:

```bash
grep -n "X:\\|spring-boot|mvnw" start-all.ps1 || true
```

Expected: no output.

- [ ] **Step 2: Check database path is documented**

Run:

```bash
grep -R "backend-node/data/gm_helper.db" README.md docs/local-persistence-checklist.md docs/superpowers/specs/2026-07-31-local-persistence-migration-design.md
```

Expected: all three files contain the database path.

- [ ] **Step 3: Check frontend has no hardcoded duplicated API base in services**

Run:

```bash
grep -R "http://localhost:8080/api" frontend/src/services
```

Expected: only `frontend/src/services/requestUtil.js` contains this string.

- [ ] **Step 4: Run frontend build**

Run:

```bash
cd frontend && npm run build
```

Expected: exit code 0.

- [ ] **Step 5: Run backend startup smoke check**

Run:

```bash
cd backend-node && node -e "const { getDb } = require('./db'); const db = getDb(); console.log(db.prepare('select name from sqlite_master where type = ? and name = ?').get('table', 'campaign') ? 'campaign table ok' : 'campaign table missing');"
```

Expected output:

```text
campaign table ok
```

- [ ] **Step 6: Inspect git diff**

Run:

```bash
git diff -- start-all.ps1 README.md frontend/src/services frontend/src/views/BattleControl.vue docs/local-persistence-checklist.md docs/superpowers/plans/2026-07-31-local-persistence-migration-plan.md
```

Expected: diff only includes planned changes.

- [ ] **Step 7: Final commit if prior tasks were not committed separately**

If previous tasks were not committed separately, commit all planned changes together:

```bash
git add start-all.ps1 README.md frontend/src/services frontend/src/views/BattleControl.vue docs/local-persistence-checklist.md docs/superpowers/plans/2026-07-31-local-persistence-migration-plan.md docs/superpowers/specs/2026-07-31-local-persistence-migration-design.md
git commit -m "chore: support local persistence workflow"
```

If previous task commits already exist, only add and commit the plan document:

```bash
git add docs/superpowers/plans/2026-07-31-local-persistence-migration-plan.md
git commit -m "docs: plan local persistence workflow"
```
