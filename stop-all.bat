@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   Fate GM Helper 一键停止
echo ============================================
echo 将停止: 后端(8100) + Koishi(5140)
echo 保留  : NapCat / QQ / DSH 不受影响
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-all.ps1"

endlocal
