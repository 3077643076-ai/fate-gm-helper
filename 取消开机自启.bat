@echo off
rem ============================================================
rem 取消开机自启：删除启动文件夹里的快捷方式
rem 重新启用：双击"设置开机自启.bat"
rem ============================================================
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Remove-Item ([Environment]::GetFolderPath('Startup') + '\FateGM工作台.lnk') -ErrorAction SilentlyContinue"
echo 已取消开机自启
pause
