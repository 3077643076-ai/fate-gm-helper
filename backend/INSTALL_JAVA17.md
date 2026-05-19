# 安装 Java 17 指南

## 问题说明
当前系统只有 Java 25，但项目需要 Java 17。Maven 编译器插件与 Java 25 存在兼容性问题。

## 解决方案

### 方法 1：下载并安装 Java 17 LTS

1. 访问 Oracle 或 Adoptium 下载页面：
   - Oracle: https://www.oracle.com/java/technologies/javase/jdk17-archive-downloads.html
   - Adoptium (推荐): https://adoptium.net/temurin/releases/?version=17

2. 下载 Windows x64 版本的 JDK 17

3. 安装到 `C:\Program Files\Java\jdk-17` (或类似路径)

4. 更新 `start-all.ps1` 中的 JAVA_HOME 路径

### 方法 2：使用 Chocolatey (如果已安装)

```powershell
choco install openjdk17
```

### 方法 3：使用 Scoop (如果已安装)

```powershell
scoop install openjdk17
```

## 安装后验证

运行以下命令验证安装：
```powershell
"C:\Program Files\Java\jdk-17\bin\java.exe" -version
```

应该看到类似输出：
```
java version "17.0.x" ...
```

## 更新启动脚本

安装 Java 17 后，更新 `start-all.ps1` 中的 JAVA_HOME 路径为实际的 Java 17 安装路径。

