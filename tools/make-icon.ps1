# 生成图标：和托盘图标同一套视觉（藏蓝圆底 + 白 G）
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File tools/make-icon.ps1
# 产物：
#   frontend/build/icon.png      256×256  → electron-builder 转成 exe 图标（.ico）
#   frontend/public/icon.png     256×256  → 网页 favicon
#   frontend/electron/tray.png    32×32   → exe 系统托盘图标（打进 asar，main.cjs 读它）
# 说明：不引入图形库，用 .NET 自带的 System.Drawing 画；配色/比例和 gm-tray.ps1 的托盘图标一致
# 自检：每个尺寸都数一遍白像素，没画出"G"直接报错退出（GDI+ 在某些机器上 DrawString 会静默失败）
# ⚠️ 本文件必须存成 UTF-8 **带 BOM**：PowerShell 5.1 会把无 BOM 的 UTF-8 当 GBK 解析，
#    中文注释/字符串会直接把脚本解析崩掉。用编辑器/脚本改完记得补 BOM（gm-tray.ps1 同理）。

Add-Type -AssemblyName System.Drawing

$root = Join-Path $PSScriptRoot '..'
$buildDir = Join-Path $root 'frontend\build'
$publicDir = Join-Path $root 'frontend\public'
$electronDir = Join-Path $root 'frontend\electron'
foreach ($d in @($buildDir, $publicDir, $electronDir)) {
  if (-not (Test-Path $d)) { New-Item -ItemType Directory -Force $d | Out-Null }
}

# 画一张：藏蓝圆底（38,59,102）+ 白色 G
# 尺寸按比例推：256px → 内边距 16 / 字号 120；32px → 内边距 2 / 字号 15（和 gm-tray.ps1 完全对齐）
function New-GmIcon {
  param([int]$Size, [string]$OutFile)

  $bmp = New-Object System.Drawing.Bitmap $Size, $Size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $pad = [int]($Size / 16)
  $navy = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(38, 59, 102))
  $g.FillEllipse($navy, $pad, $pad, ($Size - 2 * $pad), ($Size - 2 * $pad))

  $font = New-Object System.Drawing.Font ('Segoe UI', [single]($Size * 0.47), [System.Drawing.FontStyle]::Bold)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF (0, 0, $Size, ($Size - $Size / 32))   # 略微上移，视觉居中
  $g.DrawString('G', $font, [System.Drawing.Brushes]::White, $rect, $fmt)
  $g.Flush()
  $g.Dispose()

  # 自检：数白像素（256 用步长 2 够看，32 要逐像素）
  $step = if ($Size -ge 128) { 2 } else { 1 }
  $white = 0
  for ($y = 0; $y -lt $Size; $y += $step) {
    for ($x = 0; $x -lt $Size; $x += $step) {
      $c = $bmp.GetPixel($x, $y)
      if ($c.R -gt 200 -and $c.G -gt 200 -and $c.B -gt 200 -and $c.A -gt 100) { $white++ }
    }
  }
  if ($white -lt 20) {
    $bmp.Dispose()
    Write-Error "G 字没画出来（$Size px 白像素只有 $white 个），检查 System.Drawing/Segoe UI 是否可用"
    exit 1
  }

  $bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output ("生成 {0}（{1}x{1}，白像素 {2}）" -f $OutFile, $Size, $white)
}

$icon = Join-Path $buildDir 'icon.png'
New-GmIcon -Size 256 -OutFile $icon
Copy-Item $icon (Join-Path $publicDir 'icon.png') -Force
New-GmIcon -Size 32 -OutFile (Join-Path $electronDir 'tray.png')

Write-Output ''
Write-Output '全部完成：'
Write-Output '  exe 图标   frontend/build/icon.png'
Write-Output '  favicon    frontend/public/icon.png'
Write-Output '  托盘图标   frontend/electron/tray.png'
