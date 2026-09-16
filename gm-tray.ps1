# ============================================================
# GM 工作台托盘（仿海豹骰的系统托盘图标）
# 作用：双击"启动GM工作台.bat"后，右下角出现托盘图标，由它管理后端：
#   - 单击菜单/双击图标：打开工作台网页
#   - 重启后端：杀掉托盘拉起的 node 进程再重新启动
#   - 退出：停掉后端并收起图标
# 技术点：Windows 自带 System.Windows.Forms.NotifyIcon，零第三方依赖
# ============================================================

# ---------- 防多开：已有托盘在跑就直接退出 ----------
$mutex = New-Object System.Threading.Mutex($false, 'Global\FateGmTray')
if (-not $mutex.WaitOne(0)) { exit }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# ---------- 常量 ----------
$backendDir = Join-Path $PSScriptRoot 'backend-node'
$homeUrl    = 'http://127.0.0.1:8100/campaign/settle-pre'

# ---------- 工具函数 ----------

# 检查 8100 端口是否已有服务在听（TCP 探测，快）
function Test-BackendPort {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $task = $client.ConnectAsync('127.0.0.1', 8100)
    if ($task.Wait(500) -and $client.Connected) { return $true }
    return $false
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

# 启动后端（隐藏窗口），返回进程对象
function Start-Backend {
  Start-Process node -ArgumentList 'index.js' `
    -WorkingDirectory $backendDir -WindowStyle Hidden -PassThru
}

# ---------- 画托盘图标：藏蓝圆底 + 白色 G 字（工作台主色） ----------
$bmp = New-Object System.Drawing.Bitmap 32, 32
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::Transparent)
$navy = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(38, 59, 102))
$g.FillEllipse($navy, 2, 2, 28, 28)
$font = New-Object System.Drawing.Font('Segoe UI', 15, [System.Drawing.FontStyle]::Bold)
$g.DrawString('G', $font, [System.Drawing.Brushes]::White, 8, 3)
$g.Dispose()
$trayIcon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())

# ---------- 托盘图标 + 菜单 ----------
$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = $trayIcon
$notify.Text = '空想圣杯 GM 工作台'
$notify.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip

# 菜单第一行：后端状态（每 3 秒刷新文字，点击=重启后端）
$statusItem = $menu.Items.Add('后端：启动中…')
$statusItem.add_Click({ Restart-Backend })

$openItem = $menu.Items.Add('打开工作台')
$openItem.add_Click({ Start-Process $homeUrl })

$sep1 = $menu.Items.Add('-')

$restartItem = $menu.Items.Add('重启后端')
$restartItem.add_Click({ Restart-Backend })

$exitItem = $menu.Items.Add('退出（停掉后端）')

$notify.ContextMenuStrip = $menu

# 双击图标 = 打开工作台
$notify.add_DoubleClick({ Start-Process $homeUrl })

# ---------- 后端生命周期 ----------
$script:proc = $null

function Restart-Backend {
  # 只杀托盘自己拉起的进程；外部启动的（npm start）不碰，避免误杀
  if ($script:proc -and -not $script:proc.HasExited) {
    try { $script:proc.Kill() } catch { }
    Start-Sleep -Milliseconds 500
  }
  if (-not (Test-BackendPort)) {
    $script:proc = Start-Backend
    $script:lastStart = Get-Date
  }
  Update-Status
}

function Update-Status {
  $running = Test-BackendPort
  if ($running) {
    $statusItem.Text = '后端：运行中（点此重启）'
  } else {
    $statusItem.Text = '后端：未运行（点此启动）'
  }
}

# ---------- 退出 ----------
# 手动退出开关：点"退出"后停止自愈，才能真正关掉
$script:quitting = $false
$exitItem.add_Click({
  $script:quitting = $true
  if ($script:proc -and -not $script:proc.HasExited) {
    try { $script:proc.Kill() } catch { }
  }
  $notify.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})

# ---------- 状态刷新 + 自愈定时器 ----------
# 自愈：后端挂了（端口没服务）就自动重新拉起——这是"海豹式常驻"的关键
# 节流：8 秒内刚启动过就不重复拉，避免后端还在启动中被反复杀
$script:lastStart = $null

function Auto-Heal {
  if ($script:quitting) { return }
  if (Test-BackendPort) { return }
  if ($script:lastStart -and ((Get-Date) - $script:lastStart).TotalSeconds -lt 8) { return }
  $script:proc = Start-Backend
  $script:lastStart = Get-Date
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 3000
$timer.add_Tick({
  Update-Status
  Auto-Heal
})
$timer.Start()

# ---------- 启动流程：端口没服务才拉后端（已在跑就不动它） ----------
if (-not (Test-BackendPort)) {
  $script:proc = Start-Backend
  $script:lastStart = Get-Date
  Start-Sleep -Seconds 2
}
Update-Status
$notify.ShowBalloonTip(2000, 'GM 工作台', '后端已就绪，双击图标打开工作台；挂掉会自动重启', [System.Windows.Forms.ToolTipIcon]::Info)

# 进 Windows 消息循环（托盘活着的前提），退出菜单触发 Exit 后走到这里返回
[System.Windows.Forms.Application]::Run()
