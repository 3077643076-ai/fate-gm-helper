@echo off
setlocal
cd /d "%~dp0"

rem 引擎控制台启动器：构建前端 → 起后端 → Edge app 模式开独立深色窗口（MAA 风格）
set "APP_URL=http://localhost:8100/engine"
set "BACKEND_DIR=%~dp0backend-node"

echo [Sanguo Engine] Building frontend...
call npm --prefix frontend run build
if errorlevel 1 goto error

echo [Sanguo Engine] Starting backend (port 8100)...
start "Sanguo Engine Backend" cmd /k "cd /d "%BACKEND_DIR%" && npm start"

echo [Sanguo Engine] Waiting for backend...
timeout /t 3 /nobreak >nul

call :open_app_window
goto end

:open_app_window
rem Edge/Chrome 的 app 模式：无边框独立窗口，观感即桌面程序（无需 Electron）
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "Sanguo Engine" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app=%APP_URL% --window-size=1280,860
  exit /b 0
)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "Sanguo Engine" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app=%APP_URL% --window-size=1280,860
  exit /b 0
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  start "Sanguo Engine" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app=%APP_URL% --window-size=1280,860
  exit /b 0
)

echo [Sanguo Engine] Edge/Chrome not found, opening default browser.
start "" "%APP_URL%"
exit /b 0

:error
echo [Sanguo Engine] Build failed. Check npm install / build output.
pause
exit /b 1

:end
endlocal
