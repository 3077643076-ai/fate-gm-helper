# ============================================================
#  Fate GM Helper 看门狗：自动拉起断掉的服务
#  每 N 秒检查：NapCat(3001) / Koishi(5140) / 后端(8100)
#  有缺失就调用 start-all.ps1 -Auto（幂等：只在缺时启动）
#  日志写入 logs/watchdog.log
#  用法: powershell -WindowStyle Hidden -File watchdog.ps1
# ============================================================
param([int]$IntervalSec = 30)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = Join-Path $root 'logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$log = Join-Path $logDir 'watchdog.log'

function Get-PortPid([int]$port) {
  $lines = netstat -ano 2>$null | Select-String ":$port\s" | Select-String 'LISTENING'
  foreach ($l in $lines) {
    $p = ($l.Line.Trim() -split '\s+') | Where-Object { $_ }
    if ($p.Count -ge 5) { return [int]$p[-1] }
  }
  return $null
}

function Log($msg) {
  $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  try { Add-Content -Path $log -Value "[$ts] $msg" -Encoding UTF8 } catch {}
}

Log '看门狗启动（3001 NapCat / 5140 Koishi / 8100 后端）'
$guard = 0   # 防止连续重启风暴
while ($true) {
  $missing = @()
  if (-not (Get-PortPid 3001)) { $missing += 'NapCat(3001)' }
  if (-not (Get-PortPid 5140)) { $missing += 'Koishi(5140)' }
  if (-not (Get-PortPid 8100)) { $missing += '后端(8100)' }

  if ($missing.Count -gt 0) {
    if ($guard -ge 5) {
      Log "连续多次检测到缺失（$($missing -join ', ')），暂停 10 分钟避免重启风暴"
      Start-Sleep -Seconds 600
      $guard = 0
      continue
    }
    Log "检测到缺失: $($missing -join ', ') → 调用 start-all 补齐"
    try {
      & (Join-Path $root 'start-all.ps1') -Mode prod -Auto 2>&1 | Out-Null
      Log 'start-all 调用完成'
      $guard++
    } catch {
      Log "start-all 调用失败: $($_.Exception.Message)"
    }
  } else {
    $guard = 0
  }
  Start-Sleep -Seconds $IntervalSec
}
