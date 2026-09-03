@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

rem 一键启动全部：NapCat + Koishi + 后端 + 前端
rem 用法:
rem   start-all.bat         生产模式（构建前端，后端托管 http://localhost:8100）
rem   start-all.bat dev     开发模式（Vite 热更新 http://localhost:3100）

set "MODE=prod"
if /i "%~1"=="dev" set "MODE=dev"

echo ============================================
echo   Fate GM Helper 一键启动 (%MODE% 模式)
echo ============================================
echo 将依次启动:
echo   [1] NapCat  (OneBot 服务, 需管理员授权)
echo   [2] Koishi  (QQ 机器人, 连接 NapCat)
echo   [3] 后端    (backend-node, API 服务)
echo   [4] 前端    (%MODE% 模式)
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-all.ps1" -Mode %MODE%

echo.
echo 脚本执行完毕，各服务窗口已打开。
echo 关闭本窗口不影响已启动的服务窗口。
pause

endlocal
