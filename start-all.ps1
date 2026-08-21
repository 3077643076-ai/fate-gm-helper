# 一键启动开发模式：Node 后端 + Vite 前端

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Start-Process powershell -ArgumentList @(
  '-NoExit',
  '-Command',
  "cd '$root\backend-node'; npm run dev"
)

Start-Process powershell -ArgumentList @(
  '-NoExit',
  '-Command',
  "cd '$root\frontend'; npm run dev"
)

Write-Host 'Backend:  http://localhost:8100'
Write-Host 'Frontend: http://localhost:3100'
