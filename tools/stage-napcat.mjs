// 把本机已装的 NapCat 拷进分发包 staging，让"工作台 + QQ 机器人"打成一个包（下下来就能扫码登录）
// 用法：node tools/stage-napcat.mjs [NapCat 目录]     不传目录就自动找本机已装的
// 产物：frontend/electron-napcat-staging/  （electron-builder / 打包 zip 用）
//
// ⚠️ 许可（NapCat 不是开源协议，是自定义的 Limited Redistribution License）：
//   允许随包分发，但必须 ① 附完整许可原文 ② 注明来源与版权；且仅限非商业用途。
//   所以这里做三件事：
//     1) 整份拷贝，不改 NapCat 代码
//     2) 排除用户私有运行数据：config/（账号配置 / WebUI token / onebot token）、cache/、logs/、launch.log
//        —— NapCat 首次启动会自己生成默认 config/webui.json（源码 ensureConfigFileExists 确认过）
//     3) 写入 LICENSE-NapCat.txt（许可原文）+ 来源与许可.md（来源、版权、非商业声明）
import { cpSync, existsSync, mkdirSync, rmSync, readdirSync, writeFileSync, statSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'frontend', 'electron-napcat-staging')
const licenseSrc = join(root, 'tools', 'third-party', 'NapCat-LICENSE.txt')

// 复用后端那套"找本机 NapCat"的逻辑，避免两处判定不一致
const napcat = require(join(root, 'backend-node', 'lib', 'onebot', 'napcat.js'))

// 排除：私有运行数据 + 下载残留。注意不能动 NapCat 本体文件（许可要求不修改）
const EXCLUDE_TOP = new Set(['config', 'cache', 'logs', 'launch.log', 'napcat-pkg.zip', 'onebot'])
function shouldSkip(relPath) {
  if (!relPath) return false
  const top = relPath.split(/[\\/]/)[0]
  return EXCLUDE_TOP.has(top) || relPath.endsWith('.zip') || relPath.endsWith('.log')
}

function dirSize(dir) {
  let total = 0
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else {
        try {
          total += statSync(p).size
        } catch {}
      }
    }
  }
  walk(dir)
  return total
}

const explicit = process.argv[2]
let srcDir = explicit || ''
if (srcDir) {
  if (!existsSync(srcDir)) {
    console.error(`指定的 NapCat 目录不存在：${srcDir}`)
    process.exit(1)
  }
} else {
  const hit = napcat.detectInstalled('') || napcat.detectLocalNapcat()
  if (!hit) {
    console.error('没找到本机已装的 NapCat。请先手动下载解压，或把目录作为参数传进来：')
    console.error('  node tools/stage-napcat.mjs "C:\\path\\to\\NapCat.Shell"')
    process.exit(1)
  }
  srcDir = hit.dir
}

console.log(`NapCat 源目录：${srcDir}`)
if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })

cpSync(srcDir, dest, {
  recursive: true,
  filter: (srcPath) => {
    const rel = srcPath.slice(srcDir.length + 1)
    return !shouldSkip(rel)
  },
})

// 许可与来源说明（分发合规要求）
const licenseText = existsSync(licenseSrc)
  ? require('node:fs').readFileSync(licenseSrc, 'utf8')
  : '（缺 LICENSE 原文，请从 https://github.com/NapNeko/NapCatQQ/blob/main/LICENSE 获取）'
writeFileSync(join(dest, 'LICENSE-NapCat.txt'), licenseText, 'utf8')
writeFileSync(
  join(dest, '来源与许可.md'),
  `# 内置的 NapCat 是哪来的、能不能随包分发

- 组件：NapCat（NapCatQQ）
- 来源：https://github.com/NapNeko/NapCatQQ
- 版权：Copyright © 2024 Mlikiowa
- 许可：Limited Redistribution License for NapCat（原文见同目录 \`LICENSE-NapCat.txt\`）
  - 允许随本工具一起分发，前提是**附带完整许可原文**并**注明来源与版权** ✅ 已随包附上
  - **仅限非商业用途**（不得用于任何商业目的）
  - 本工具**未修改 NapCat 代码**，只是没有携带账号配置/缓存等私有运行数据
     （首次启动时 NapCat 会自己生成默认 \`config/webui.json\`）
- 免责：NapCat 按 "as is" 提供，作者不承担任何担保或责任；本工具与 NapCat 作者无关联
`,
  'utf8',
)

const mb = (dirSize(dest) / 1024 / 1024).toFixed(1)
let files = 0
const count = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) count(join(d, e.name))
    else files++
  }
}
count(dest)
console.log(`staging 完成 → frontend/electron-napcat-staging（${files} 个文件，${mb} MB）`)
console.log('已排除：config/ cache/ logs/（NapCat 首次启动会生成默认配置）')
console.log('已附上：LICENSE-NapCat.txt（许可原文）、来源与许可.md（来源+版权+非商业声明）')
