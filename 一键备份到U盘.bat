@echo off
chcp 65001 >nul
echo ===== fate-gm-helper backup to USB =====
node "%~dp0tools\backup-to-usb.mjs" E
echo.
if not errorlevel 1 (
  echo Backup OK. Safe to unplug the USB drive.
) else (
  echo Backup FAILED. Check the USB drive.
)
pause
