# ============================================================
#  Fate GM Helper 一键启动：NapCat + Koishi + 后端 + 前端
#  所有服务静默后台运行，日志写入 logs/ 目录，不弹终端窗口。
#  用法:
#    start-all.bat            生产模式（后端托管 http://localhost:8100）
#    start-all.bat dev        开发模式（Vite 热更新 http://localhost:3100）
#  停止: stop-all.bat （按端口精确停止，不会误伤其他程序）
# ============================================================

param(
  [string]$Mode = "prod",   # prod | dev
  [switch]$Auto             # 开机自启模式：不弹浏览器、顺手关闭睡眠（需管理员运行）
)

$ErrorActionPreference = "Continue"

# ---------- 可调配置 ----------
$NapCatDir   = "C:\Users\30776\Downloads\NapCat.Shell"
$QQUin       = "715218931"          # 机器人 QQ 号
$OneBotPort  = 3001                 # NapCat onebot11 WebSocket 端口
$BackendPort = 8100                 # 后端端口
$VitePort    = 3100                 # 前端开发端口
$KoishiPort  = 5140                 # Koishi 控制台端口
$KoishiDir   = Join-Path $PSScriptRoot "my-koishi-bot"
$BackendDir  = Join-Path $PSScriptRoot "backend-node"
$FrontendDir = Join-Path $PSScriptRoot "frontend"
$LogsDir     = Join-Path $PSScriptRoot "logs"
# --------------------------------

# 已记录的后端/Koishi PID（供 stop-all 使用，不依赖进程名）
$PidFile = Join-Path $LogsDir "service-pids.txt"

function Write-Step($msg) {
  Write-Host ""
  Write-Host "==> $msg" -ForegroundColor Cyan
}

function Get-PidByPort($port) {
  $lines = netstat -ano 2>$null | Select-String ":$port\s" | Select-String "LISTENING"
  foreach ($line in $lines) {
    $parts = ($line.Line.Trim() -split '\s+') | Where-Object { $_ }
    if ($parts.Count -ge 5) { return [int]$parts[-1] }
  }
  return $null
}

function Save-Pid($name, $pidValue) {
  $existing = @()
  if (Test-Path $PidFile) {
    $existing = Get-Content $PidFile | Where-Object { $_ -match '^\S+ \d+$' -and $_ -notmatch "^$name " }
  }
  $existing += "$name $pidValue"
  [System.IO.File]::WriteAllLines($PidFile, $existing, (New-Object System.Text.UTF8Encoding($false)))
}

# ---------- 0. 环境检查 ----------
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Fate GM Helper 一键启动 ($Mode 模式)" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

if (-not (Test-Path $NapCatDir)) {
  Write-Host "[错误] 找不到 NapCat 目录: $NapCatDir" -ForegroundColor Red
  Write-Host "       请修改 start-all.ps1 顶部的 \$NapCatDir 指向你的 NapCat 目录" -ForegroundColor Yellow
  exit 1
}
if (-not (Test-Path (Join-Path $NapCatDir "launcher-win10.bat"))) {
  Write-Host "[错误] NapCat 目录里没有 launcher-win10.bat（需要 Windows Shell 注入版）" -ForegroundColor Red
  exit 1
}
if (-not (Test-Path (Join-Path $KoishiDir "package.json"))) {
  Write-Host "[错误] 找不到 Koishi 项目: $KoishiDir" -ForegroundColor Red
  exit 1
}

New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null

# ---------- 0.5 自启模式：关闭睡眠（7×24 常开） ----------
if ($Auto) {
  Write-Step "自启模式：关闭睡眠（7×24 常开）"
  powercfg /change standby-timeout-ac 0 2>$null | Out-Null   # 插电永不睡眠
  powercfg /change hibernate-timeout-ac 0 2>$null | Out-Null # 插电永不休眠
  powercfg /change monitor-timeout-ac 20 2>$null | Out-Null  # 显示器 20 分钟熄屏（省电，不影响运行）
}

# ---------- 1. 生成/检查 NapCat onebot11 配置 ----------
Write-Step "检查 NapCat OneBot 配置"
$napcatConfigDir = Join-Path $NapCatDir "config"
if (-not (Test-Path $napcatConfigDir)) { New-Item -ItemType Directory -Path $napcatConfigDir -Force | Out-Null }

$ob11File = Join-Path $napcatConfigDir "onebot11.json"
$needCreate = $true
if (Test-Path $ob11File) {
  try {
    $existing = Get-Content $ob11File -Raw | ConvertFrom-Json
    if ($existing.network.websocketServers) { $needCreate = $false }
  } catch { $needCreate = $true }
}
if ($needCreate) {
  $ob11 = @{
    network = @{
      websocketServers = @(
        @{
          name                 = "websocket-server"
          enable               = $true
          host                 = "127.0.0.1"
          port                 = $OneBotPort
          messagePostFormat    = "array"
          reportSelfMessage    = $false
          token                = ""
          enableForcePushEvent = $true
          debug                = $false
          heartInterval        = 30000
        }
      )
    }
  }
  # 无 BOM UTF-8（PowerShell 5.1 的 Set-Content -Encoding UTF8 会带 BOM，NapCat 解析 JSON 可能失败）
  $ob11Json = $ob11 | ConvertTo-Json -Depth 6
  [System.IO.File]::WriteAllText($ob11File, $ob11Json, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "[OK] 已写入 NapCat OneBot 配置: $ob11File" -ForegroundColor Green
} else {
  Write-Host "[OK] NapCat OneBot 配置已存在，跳过" -ForegroundColor Green
}

$ob11UinFile = Join-Path $napcatConfigDir "onebot11_$QQUin.json"
if (-not (Test-Path $ob11UinFile)) {
  Copy-Item $ob11File $ob11UinFile
  Write-Host "[OK] 已生成按 QQ 号命名的配置: $ob11UinFile" -ForegroundColor Green
}

# ---------- 2. 检查 koishi.yml ----------
Write-Step "检查 Koishi 配置"
$koishiYml = Join-Path $KoishiDir "koishi.yml"
if (-not (Test-Path $koishiYml)) {
  Write-Host "[错误] 缺少 $koishiYml" -ForegroundColor Red
  Write-Host "       请参考 my-koishi-bot/koishi.example.yml 创建，并配置 adapter-onebot 连接 ws://127.0.0.1:$OneBotPort" -ForegroundColor Yellow
  exit 1
} else {
  Write-Host "[OK] koishi.yml 已存在" -ForegroundColor Green
}

# ---------- 3. NapCat ----------
Write-Step "检查 NapCat 服务"
$napcatPid = Get-PidByPort $OneBotPort
if ($napcatPid) {
  Write-Host "[OK] NapCat OneBot 已在运行 (PID $napcatPid, 端口 $OneBotPort)，跳过启动" -ForegroundColor Green
} else {
  Write-Host "启动 NapCat（需要管理员权限，会弹 UAC，请点击“是”）..."
  $napcatLauncher = Join-Path $NapCatDir "launcher-win10.bat"
  $napcatLog = Join-Path $LogsDir "napcat.log"
  try {
    # 带 QQ 号参数启动 = 快速登录（登录态有效时免扫码直接恢复会话）
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "cd /d `"$NapCatDir`" && `"$napcatLauncher`" $QQUin > `"$napcatLog`" 2>&1" -WindowStyle Hidden
    Write-Host "[OK] NapCat 启动中（快速登录 QQ=$QQUin，隐藏窗口，日志: logs/napcat.log）" -ForegroundColor Green
  } catch {
    Write-Host "[警告] NapCat 启动命令执行失败: $($_.Exception.Message)" -ForegroundColor Yellow
  }
  Write-Host "若登录态有效会自动免扫码；失效时请在弹出的 QQ 登录窗口扫码一次。" -ForegroundColor Yellow
  # 等待 OneBot 端口就绪（首次扫码可能较久）
  $deadline = (Get-Date).AddSeconds(300)
  $ready = $false
  while ((Get-Date) -lt $deadline) {
    if (Get-PidByPort $OneBotPort) { $ready = $true; break }
    Start-Sleep -Seconds 3
  }
  if ($ready) {
    Write-Host "[OK] NapCat OneBot 已就绪 (端口 $OneBotPort)" -ForegroundColor Green
  } else {
    Write-Host "[警告] 等待 NapCat 超时，后续 Koishi 会持续重连，QQ 登录完成后即可生效" -ForegroundColor Yellow
  }
}

# ---------- 4. Koishi ----------
Write-Step "检查 Koishi 服务"
$koishiPid = Get-PidByPort $KoishiPort
if ($koishiPid) {
  Write-Host "[OK] Koishi 已在运行 (PID $koishiPid, 端口 $KoishiPort)，跳过启动" -ForegroundColor Green
} else {
  Write-Host "启动 Koishi（后台运行，日志: logs/koishi.log）..."
  # 注意: fate-actions 插件 main 指向 src/index.ts，必须用 dev 模式加载 TS
  $koishiLog = Join-Path $LogsDir "koishi.log"
  try {
    $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "cd /d `"$KoishiDir`" && yarn dev > `"$koishiLog`" 2>&1" -WorkingDirectory $KoishiDir -WindowStyle Hidden -PassThru
    Save-Pid "koishi" $p.Id
    Write-Host "[OK] Koishi 启动中（连接 NapCat ws://127.0.0.1:$OneBotPort）" -ForegroundColor Green
  } catch {
    Write-Host "[警告] Koishi 启动失败: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

# ---------- 5. 后端（+ 前端） ----------
Write-Step "检查后端服务"
$backendPid = Get-PidByPort $BackendPort
if ($backendPid) {
  Write-Host "[OK] 后端已在运行 (PID $backendPid, 端口 $BackendPort)，跳过启动" -ForegroundColor Green
} else {
  if ($Mode -eq "dev") {
    Write-Host "启动开发模式：后端 + Vite..."
    $backendLog = Join-Path $LogsDir "backend-dev.log"
    $viteLog = Join-Path $LogsDir "vite-dev.log"
    try {
      $p1 = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "cd /d `"$BackendDir`" && npm run dev > `"$backendLog`" 2>&1" -WorkingDirectory $BackendDir -WindowStyle Hidden -PassThru
      Save-Pid "backend" $p1.Id
      $p2 = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "cd /d `"$FrontendDir`" && npm run dev > `"$viteLog`" 2>&1" -WorkingDirectory $FrontendDir -WindowStyle Hidden -PassThru
      Save-Pid "vite" $p2.Id
      Write-Host "[OK] 开发模式启动中（日志: logs/backend-dev.log, logs/vite-dev.log）" -ForegroundColor Green
    } catch {
      Write-Host "[警告] 开发模式启动失败: $($_.Exception.Message)" -ForegroundColor Yellow
    }
  } else {
    Write-Host "启动后端（后台运行，日志: logs/backend.log）..."
    # 检查前端是否已构建
    if (-not (Test-Path (Join-Path $FrontendDir "dist\index.html"))) {
      Write-Host "前端尚未构建，正在构建（日志: logs/build.log）..."
      $buildLog = Join-Path $LogsDir "build.log"
      try {
        cmd /c "cd /d `"$FrontendDir`" && npm run build > `"$buildLog`" 2>&1"
        if ($LASTEXITCODE -ne 0) {
          Write-Host "[错误] 前端构建失败，请查看 logs/build.log" -ForegroundColor Red
        } else {
          Write-Host "[OK] 前端构建完成" -ForegroundColor Green
        }
      } catch {
        Write-Host "[警告] 前端构建失败: $($_.Exception.Message)" -ForegroundColor Yellow
      }
    }
    $backendLog = Join-Path $LogsDir "backend.log"
    try {
      $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "cd /d `"$BackendDir`" && npm start > `"$backendLog`" 2>&1" -WorkingDirectory $BackendDir -WindowStyle Hidden -PassThru
      Save-Pid "backend" $p.Id
      Write-Host "[OK] 后端启动中" -ForegroundColor Green
    } catch {
      Write-Host "[警告] 后端启动失败: $($_.Exception.Message)" -ForegroundColor Yellow
    }
  }
}

# ---------- 6. 等待后端就绪并打开浏览器 ----------
Write-Step "等待服务就绪"
$deadline = (Get-Date).AddSeconds(60)
$backendReady = $false
while ((Get-Date) -lt $deadline) {
  if (Get-PidByPort $BackendPort) { $backendReady = $true; break }
  Start-Sleep -Seconds 2
}
if ($backendReady) {
  Write-Host "[OK] 后端已就绪" -ForegroundColor Green
} else {
  Write-Host "[警告] 后端未在 60 秒内就绪，请查看 logs/backend.log" -ForegroundColor Yellow
}

$webUrl = if ($Mode -eq "dev") { "http://localhost:$VitePort" } else { "http://localhost:$BackendPort" }
if ($Auto) {
  Write-Host "[自启] 已跳过打开浏览器（需要时手动访问 $webUrl）" -ForegroundColor Yellow
} else {
  try {
    Start-Process $webUrl
    Write-Host "[OK] 已打开 $webUrl" -ForegroundColor Green
  } catch {
    Write-Host "[提示] 请手动访问 $webUrl" -ForegroundColor Yellow
  }
}

# ---------- 7. 汇总 ----------
Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  启动完成（所有服务静默后台运行）" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Web 界面 : $webUrl"
Write-Host "  后端 API : http://localhost:$BackendPort/api"
Write-Host "  Koishi   : http://localhost:$KoishiPort"
Write-Host "  NapCat   : OneBot ws://127.0.0.1:$OneBotPort  (webui http://127.0.0.1:6099)"
Write-Host ""
Write-Host "  日志文件（logs/ 目录）:" -ForegroundColor Yellow
Write-Host "    backend.log / koishi.log / napcat.log / build.log"
Write-Host "  停止服务: 双击 stop-all.bat（按端口精确停止，不会误伤其他程序）" -ForegroundColor Green
Write-Host "  首次使用: NapCat 弹 UAC 点“是”，QQ 未登录时扫码登录" -ForegroundColor Yellow
Write-Host "  群指令  : .绑定战役 <ID> / .从者行动 <阶职> <内容> / .御主行动 <阶职> <内容>" -ForegroundColor Yellow
Write-Host ""
