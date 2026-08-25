@echo off
setlocal
cd /d "%~dp0"

set "APP_URL=http://localhost:8100"
set "BACKEND_DIR=%~dp0backend-node"

echo [Fate GM Helper] Building frontend...
call npm --prefix frontend run build
if errorlevel 1 goto error

echo [Fate GM Helper] Starting local server...
start "Fate GM Helper Server" cmd /k "cd /d "%BACKEND_DIR%" && npm start"

echo [Fate GM Helper] Waiting for server...
timeout /t 3 /nobreak >nul

call :open_app_window
goto end

:open_app_window
rem 优先用 Edge/Chrome 的 app 模式打开独立窗口，不改项目架构，也不用额外打包 Electron。
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "Fate GM Helper" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app=%APP_URL%
  exit /b 0
)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "Fate GM Helper" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app=%APP_URL%
  exit /b 0
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  start "Fate GM Helper" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app=%APP_URL%
  exit /b 0
)

echo [Fate GM Helper] Edge/Chrome not found, opening default browser.
start "" "%APP_URL%"
exit /b 0

:error
echo [Fate GM Helper] Failed to start. Please check npm install and build errors.
pause
exit /b 1

:end
endlocal
