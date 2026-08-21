@echo off
setlocal
cd /d "%~dp0"

echo Building frontend...
call npm --prefix frontend run build
if errorlevel 1 goto error

echo Starting Fate GM Helper at http://localhost:8100
call npm --prefix backend-node start
goto end

:error
echo Failed to start Fate GM Helper.
exit /b 1

:end
endlocal
