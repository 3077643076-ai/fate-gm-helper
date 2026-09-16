@echo off
rem ============================================================
rem 设置开机自启：把"启动GM工作台"放进 Windows 启动文件夹
rem 开机后托盘图标自动出现，后端自动就绪，不用手动双击
rem 取消自启：双击"取消开机自启.bat"
rem ============================================================
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$lnk = $ws.CreateShortcut([Environment]::GetFolderPath('Startup') + '\FateGM工作台.lnk');" ^
  "$lnk.TargetPath = '%~dp0启动GM工作台.bat';" ^
  "$lnk.WorkingDirectory = '%~dp0';" ^
  "$lnk.Save()"
echo 已设置开机自启（启动文件夹：shell:startup）
pause
