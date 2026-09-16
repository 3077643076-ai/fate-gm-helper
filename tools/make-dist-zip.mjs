// 打发行包：把「工作台 exe + 内置 NapCat + 使用说明」装进一个 zip，别人解压双击就能扫码登录 QQ
// 用法：node tools/make-dist-zip.mjs
// 前置：先跑过 npm --prefix frontend run dist（产出 desktop/SanguoEngine*.exe）
//      和 node tools/stage-napcat.mjs（产出 frontend/electron-napcat-staging）
// 产物：desktop/圣杯GM工作台-便携版-含QQ机器人.zip
//
// 为什么用 zip 而不是把 NapCat 塞进 exe：
//   便携 exe 每次启动都要把自己解包到 %TEMP%，NapCat 有 122MB（native 二进制就占 78MB），
//   塞进去等于每次双击多等好几秒。放成 exe 旁边的 napcat/ 文件夹，启动还是 3 秒，且登录态能长期留存。
import { existsSync, mkdirSync, rmSync, readdirSync, copyFileSync, writeFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

// 用后端那份"安全递归拷贝"：fs.cpSync 碰到中文目标路径会建到乱码目录（本文件下方 _zip-stage 就是中文）
const require = createRequire(import.meta.url)
const { copyDirSync } = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'backend-node', 'lib', 'copy-dir.js'))

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const desktopDir = join(root, 'desktop')
const napcatStage = join(root, 'frontend', 'electron-napcat-staging')
const pkgName = '圣杯GM工作台'
const stageDir = join(desktopDir, '_zip-stage', pkgName)
const zipPath = join(desktopDir, '圣杯GM工作台-便携版-含QQ机器人.zip')

// 1) 找 exe
const exes = existsSync(desktopDir)
  ? readdirSync(desktopDir).filter((f) => f.endsWith('.exe') && !f.includes('unpacked'))
  : []
if (exes.length === 0) {
  console.error('没找到 exe，先跑：npm --prefix frontend run dist')
  process.exit(1)
}
const exeName = exes.sort((a, b) => statSync(join(desktopDir, b)).mtimeMs - statSync(join(desktopDir, a)).mtimeMs)[0]
console.log(`使用 exe：${exeName}`)

if (!existsSync(napcatStage)) {
  console.error('没找到 frontend/electron-napcat-staging，先跑：node tools/stage-napcat.mjs')
  process.exit(1)
}

// 2) 组装目录
if (existsSync(stageDir)) rmSync(stageDir, { recursive: true, force: true })
mkdirSync(stageDir, { recursive: true })
copyFileSync(join(desktopDir, exeName), join(stageDir, `${pkgName}.exe`))
const napcatFiles = copyDirSync(napcatStage, join(stageDir, 'napcat'))
console.log(`已放入：exe + napcat/（${napcatFiles} 个文件，含 LICENSE-NapCat.txt 与来源说明）`)

// 3) 使用说明（给拿到包的人看）
writeFileSync(
  join(stageDir, '使用说明.txt'),
  `空想圣杯 GM 工作台（便携版）
========================================

怎么用
------
1. 双击 ${pkgName}.exe（第一次运行 Windows 可能提示"未知发布者"，点"更多信息 → 仍要运行"）
2. 右下角出现托盘图标，浏览器窗口打开工作台
3. 战役数据、QQ 配置都在同目录的 data\\ 文件夹里，整个文件夹拷走就等于搬家

登录 QQ 机器人（可选）
----------------------
1. 工作台 → 设置 → 机器人连接
2. 点"登录 QQ 机器人" → 会自动使用本目录 napcat\\ 里内置的 NapCat
3. 出二维码后扫码登录（建议先退出自己的 QQ：NapCat 是注入本机 QQ 客户端运行的）
前提：本机装了 QQ（NT 版）。没装的话只能用 OneKey 包，需另行准备。

数据与隐私
----------
- data\\gm_helper.db 是你的战役数据库；data\\napcat\\ 是机器人登录态与配置
- 这些都不会上传到任何服务器，删掉文件夹就等于清除所有数据

关于内置的 NapCat
-----------------
- NapCat（https://github.com/NapNeko/NapCatQQ，Copyright © 2024 Mlikiowa）
  采用 Limited Redistribution License：允许随包分发（需附许可原文并注明来源），仅限非商业用途
- 许可原文见 napcat\\LICENSE-NapCat.txt，来源与版权声明见 napcat\\来源与许可.md
- 本工具未修改 NapCat 代码；本工具与 NapCat 作者无关联

关闭与退出
----------
- 关窗口 = 收进托盘（后端继续跑）
- 真退出：右键右下角托盘图标 → 退出（关闭后端）
`,
  'utf8',
)

// 4) 打包成 zip
//    ⚠️ 不能用 Windows 自带 tar/bsdtar：它写中文路径名时会报 "Can't translate pathname to CP437"
//    而且会把文件整个漏掉（实测包里只剩 exe）。优先 7-Zip（带 -mcu=on 写 UTF-8 名字），
//    没有就用 PowerShell 的 Compress-Archive（.NET 会带 UTF-8 标志，实测名字正确，122MB 约 40 秒）。
if (existsSync(zipPath)) rmSync(zipPath, { force: true })
const sevenZip = ['C:\\Program Files\\7-Zip\\7z.exe', 'C:\\Program Files (x86)\\7-Zip\\7z.exe'].find((p) => existsSync(p))
if (sevenZip) {
  console.log(`用 7-Zip 打包：${sevenZip}`)
  execFileSync(sevenZip, ['a', '-tzip', '-mcu=on', '-mx=5', zipPath, pkgName], {
    cwd: join(desktopDir, '_zip-stage'),
    stdio: 'inherit',
  })
} else {
  console.log('没装 7-Zip，改用 PowerShell Compress-Archive（慢一点但没问题）')
  execFileSync(
    'powershell',
    ['-NoProfile', '-Command', `Compress-Archive -Path '${stageDir}' -DestinationPath '${zipPath}' -Force`],
    { stdio: 'inherit' },
  )
}
const mb = (statSync(zipPath).size / 1024 / 1024).toFixed(1)
console.log(`发行包完成：${zipPath}（${mb} MB）`)
