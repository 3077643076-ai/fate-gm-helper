# 自动下载并安装 Java 17
# 需要管理员权限

Write-Host "正在下载 Java 17..." -ForegroundColor Green

$java17Url = "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.13%2B11/OpenJDK17U-jdk_x64_windows_hotspot_17.0.13_11.zip"
$downloadPath = "$env:TEMP\jdk-17.zip"
$installPath = "C:\Program Files\Java\jdk-17"

try {
    # 下载 Java 17
    Write-Host "从 Adoptium 下载 Java 17..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $java17Url -OutFile $downloadPath -UseBasicParsing
    
    # 检查是否已存在安装目录
    if (Test-Path $installPath) {
        Write-Host "检测到已存在的 Java 17 安装，跳过解压步骤" -ForegroundColor Yellow
    } else {
        Write-Host "解压 Java 17 到 $installPath..." -ForegroundColor Yellow
        
        # 创建安装目录
        New-Item -ItemType Directory -Force -Path $installPath | Out-Null
        
        # 解压 ZIP 文件
        Expand-Archive -Path $downloadPath -DestinationPath "$env:TEMP\jdk-17-temp" -Force
        
        # 找到解压后的 jdk 目录并移动到目标位置
        $extractedDir = Get-ChildItem "$env:TEMP\jdk-17-temp" -Directory | Where-Object { $_.Name -like "jdk*" } | Select-Object -First 1
        if ($extractedDir) {
            Move-Item -Path $extractedDir.FullName -Destination $installPath -Force
        } else {
            # 如果结构不同，直接移动整个目录
            $jdkDir = Get-ChildItem "$env:TEMP\jdk-17-temp" | Select-Object -First 1
            if ($jdkDir) {
                Get-ChildItem $jdkDir.FullName | Move-Item -Destination $installPath -Force
            }
        }
        
        # 清理临时文件
        Remove-Item "$env:TEMP\jdk-17-temp" -Recurse -Force -ErrorAction SilentlyContinue
    }
    
    # 验证安装
    $javaExe = Join-Path $installPath "bin\java.exe"
    if (Test-Path $javaExe) {
        $version = & $javaExe -version 2>&1 | Select-String "version"
        Write-Host "Java 17 安装成功！" -ForegroundColor Green
        Write-Host "版本信息: $version" -ForegroundColor Green
        Write-Host "安装路径: $installPath" -ForegroundColor Green
        
        # 更新启动脚本
        $startScript = Join-Path $PSScriptRoot "start-all.ps1"
        if (Test-Path $startScript) {
            $content = Get-Content $startScript -Raw
            $newContent = $content -replace "jdk-25", "jdk-17"
            Set-Content -Path $startScript -Value $newContent
            Write-Host "已更新 start-all.ps1 使用 Java 17" -ForegroundColor Green
        }
    } else {
        Write-Host "安装失败：找不到 java.exe" -ForegroundColor Red
        exit 1
    }
    
    # 清理下载文件
    Remove-Item $downloadPath -Force -ErrorAction SilentlyContinue
    
} catch {
    Write-Host "错误: $_" -ForegroundColor Red
    Write-Host "请手动下载并安装 Java 17" -ForegroundColor Yellow
    Write-Host "下载地址: https://adoptium.net/temurin/releases/?version=17" -ForegroundColor Yellow
    exit 1
}

