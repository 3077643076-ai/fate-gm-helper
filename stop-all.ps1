# ============================================================
#  Fate GM Helper 一键停止：后端 + Koishi
#  安全原则: 按端口精确找到 PID 再停止，绝不按进程名批量杀，
#  不会误伤 DSH(3080/3081)、QQ、NapCat 或其他程序。
#  用法: stop-all.bat
# ============================================================

$ErrorActionPreference = "Continue"

# 需要停止的服务端口（NapCat/QQ 保留，可手动关闭）
$Services = @(
  @{ Port = 8100; Name = "后端 backend-node" },
  @{ Port = 5140; Name = "Koishi" }
)

# DSH 端口（保护名单，绝不停止）
$ProtectedPorts = @(3080, 3081)

function Get-PidByPort($port) {
  $lines = netstat -ano 2>$null | Select-String ":$port\s" | Select-String "LISTENING"
  foreach ($line in $lines) {
    $parts = ($line.Line.Trim() -split '\s+') | Where-Object { $_ }
    if ($parts.Count -ge 5) { return [int]$parts[-1] }
  }
  return $null
}

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Fate GM Helper 一键停止" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

foreach ($svc in $Services) {
  $pidValue = Get-PidByPort $svc.Port
  if (-not $pidValue) {
    Write-Host "[跳过] $($svc.Name) 未在运行 (端口 $($svc.Port))" -ForegroundColor Yellow
    continue
  }
  if ($ProtectedPorts -contains $svc.Port) {
    Write-Host "[保护] 端口 $($svc.Port) 在保护名单中，跳过" -ForegroundColor Yellow
    continue
  }
  Write-Host "[停止] $($svc.Name) (PID $pidValue, 端口 $($svc.Port))" -ForegroundColor Green
  try {
    Stop-Process -Id $pidValue -Force -ErrorAction Stop
    Write-Host "       已停止" -ForegroundColor Green
  } catch {
    Write-Host "       停止失败: $($_.Exception.Message)" -ForegroundColor Red
  }
}

Write-Host ""
Write-Host "完成。NapCat / QQ 未停止（如需停止请手动关闭 QQ）。" -ForegroundColor Yellow
Write-Host ""
pause
