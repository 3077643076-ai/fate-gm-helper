# 一键启动前后端（在项目根运行本脚本）

# 后端：Spring Boot
$javaHome = "$env:USERPROFILE\Java\jdk-17"
Start-Process powershell -ArgumentList @(
  '-NoExit'
  '-Command'
  "`$env:JAVA_HOME = '$javaHome'; cd 'X:\dev\dev\fate-gm-helper\backend'; .\mvnw.cmd spring-boot:run"
)

# 前端：Vite + Vue
Start-Process powershell -ArgumentList @(
  '-NoExit'
  '-Command'
  'cd "X:\dev\dev\fate-gm-helper\frontend"; npm run dev'
)

