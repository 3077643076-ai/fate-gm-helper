@echo off
rem ============================================
rem  7×24 常开电源设置——需要管理员权限
rem  用法：右键本文件 → 以管理员身份运行（只需一次）
rem  效果：插电永不睡眠/休眠；合盖不采取任何操作；显示器 20 分钟熄屏
rem ============================================
chcp 65001 >nul
echo 正在设置（插电永不睡眠 / 合盖不睡眠）...
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change monitor-timeout-ac 20

rem 合上盖子 = 不采取任何操作（AC 插电 / DC 电池 都设）
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /setdcvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /setactive SCHEME_CURRENT

echo.
echo 完成。验证方法：控制面板 → 电源选项 → 选择关闭盖子的功能
echo   → 应显示"不采取任何操作"（若显示"睡眠"说明本机合盖动作被厂商软件接管，
echo     需在厂商电源管理/BIOS 里改，或告诉我你的笔记本品牌型号）
pause
