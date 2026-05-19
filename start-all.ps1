# ============================================================
# 空想圣杯 GM 辅助系统 — 一键启动脚本
# 启动顺序：后端 → 前端 → (可选)机器人
# ============================================================

$projectRoot = $PSScriptRoot  # 脚本所在目录 = 项目根
$backendDir = Join-Path $projectRoot "backend"
$frontendDir = Join-Path $projectRoot "frontend"
$botDir = Join-Path $projectRoot "my-koishi-bot"

# ---- 颜色辅助函数 ----
function Write-Step($msg)  { Write-Host ">>> $msg" -ForegroundColor Cyan }
function Write-OK($msg)    { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "  [!!] $msg" -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host "  [XX] $msg" -ForegroundColor Red }

# ---- 检查 Node.js ----
Write-Step "检查 Node.js..."
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Err "未找到 Node.js，请先安装：https://nodejs.org/"
    exit 1
}
Write-OK "Node.js 已安装：$($nodeCmd.Source)"

# ---- 检查 Java ----
Write-Step "检查 Java（需要 JDK 17+）..."
# 优先用 JAVA_HOME 环境变量，否则从 PATH 推导
if ($env:JAVA_HOME) {
    $javaHome = $env:JAVA_HOME
} else {
    $javaCmd = Get-Command java -ErrorAction SilentlyContinue
    if ($javaCmd) {
        # 从 java.exe 路径推导 JAVA_HOME（去掉 \bin\java.exe）
        $javaHome = Split-Path -Parent (Split-Path -Parent $javaCmd.Source)
    }
}

$javaExe = if ($javaHome) { Join-Path $javaHome "bin\java.exe" } else { $null }

if (-not $javaExe -or -not (Test-Path $javaExe)) {
    Write-Err "未找到 Java，请运行 .\install-java17.ps1 安装，或手动设置 JAVA_HOME 环境变量"
    exit 1
}
# 验证版本
$javaVersion = & $javaExe -version 2>&1 | Select-String "version" | ForEach-Object { $_.ToString() }
Write-OK "Java 已安装：$javaVersion"

# ---- 检查 MySQL（简单检查端口） ----
Write-Step "检查 MySQL..."
$mysqlPort = 3306
$mysqlRunning = $false
try {
    $tcpTest = Test-NetConnection -ComputerName localhost -Port $mysqlPort -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
    $mysqlRunning = $tcpTest.TcpTestSucceeded
} catch {
    $mysqlRunning = $false
}
if (-not $mysqlRunning) {
    Write-Warn "MySQL 端口 $mysqlPort 无响应，请确保 MySQL 已启动且数据库 GmHelper 已创建"
    Write-Host "        后端可能启动失败！" -ForegroundColor Yellow
} else {
    Write-OK "MySQL 端口 $mysqlPort 已监听"
}

# ---- 安装前端依赖（如果没有的话） ----
Write-Step "检查前端依赖..."
if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    Write-Host "  正在安装前端依赖 (npm install)..." -ForegroundColor Yellow
    Push-Location $frontendDir
    npm install
    Pop-Location
    Write-OK "前端依赖安装完成"
} else {
    Write-OK "前端依赖已就绪"
}

# ---- 询问启动哪些服务 ----
Write-Host ""
Write-Host "请选择要启动的服务：" -ForegroundColor Magenta
Write-Host "  [1] 仅前后端（默认）"
Write-Host "  [2] 全部（后端 + 前端 + Koishi 机器人）"
Write-Host "  [3] 仅后端"
Write-Host "  [4] 仅前端"
Write-Host ""
$choice = Read-Host "输入编号 (1-4，回车默认1)"

if (-not $choice) { $choice = "1" }

$startBackend = ($choice -in "1", "2", "3")
$startFrontend = ($choice -in "1", "2", "4")
$startBot = ($choice -eq "2")

# ---- 启动后端 ----
if ($startBackend) {
    Write-Step "启动后端 (Spring Boot，端口 8080)..."
    Start-Process powershell -ArgumentList @(
        '-NoExit',
        '-Command',
        "Write-Host '=== 后端 (Spring Boot) ===' -ForegroundColor Green; " +
        "`$env:JAVA_HOME = '$javaHome'; " +
        "cd '$backendDir'; " +
        ".\mvnw.cmd spring-boot:run"
    )
    Write-OK "后端已在独立窗口启动"
}

# ---- 启动前端 ----
if ($startFrontend) {
    Write-Step "启动前端 (Vite，端口 5173)..."
    Start-Process powershell -ArgumentList @(
        '-NoExit',
        '-Command',
        "Write-Host '=== 前端 (Vite + Vue) ===' -ForegroundColor Green; " +
        "cd '$frontendDir'; " +
        "npm run dev"
    )
    Write-OK "前端已在独立窗口启动"
}

# ---- 启动机器人 ----
if ($startBot) {
    Write-Step "启动 Koishi 机器人 (端口 5140)..."
    Start-Process powershell -ArgumentList @(
        '-NoExit',
        '-Command',
        "Write-Host '=== Koishi 机器人 ===' -ForegroundColor Green; " +
        "cd '$botDir'; " +
        "yarn start"
    )
    Write-OK "机器人已在独立窗口启动"
}

# ---- 完成提示 ----
Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host "  启动完毕！各服务在独立窗口中运行" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
if ($startBackend)  { Write-Host "  后端：  http://localhost:8080" -ForegroundColor White }
if ($startFrontend) { Write-Host "  前端：  http://localhost:5173" -ForegroundColor White }
if ($startBot)      { Write-Host "  机器人：http://localhost:5140" -ForegroundColor White }
Write-Host "==============================================" -ForegroundColor Green
Write-Host ""
Write-Host "提示：关闭各窗口即可停止对应服务" -ForegroundColor DarkGray
Read-Host "按回车键退出本窗口"
