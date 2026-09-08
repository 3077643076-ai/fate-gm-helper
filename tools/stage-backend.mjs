// 打包前置：把 backend-node 完整拷到 staging 目录（electron-builder 的
// extraResources 默认忽略 node_modules，用普通文件拷贝绕过）
// 用法：node tools/stage-backend.mjs
import { cpSync, rmSync, existsSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'backend-node')
const dest = join(root, 'frontend', 'electron-backend-staging')

if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })

cpSync(src, dest, {
  recursive: true,
  filter: (srcPath) => {
    const rel = srcPath.slice(src.length + 1)
    if (!rel) return true
    // 排除：本机备份数据、测试目录、临时卡资料（保密与减体积）
    return !/^(backups|test|_cards|_unzip_\w+)(\\|\/|$)/.test(rel)
      && !/^scripts\\_|^scripts\/_/.test(rel)
      && !/_dump_/.test(rel)
      && rel !== 'data/gm_helper.db-wal' && rel !== 'data/gm_helper.db-shm'
      && rel !== 'data/gm_helper.db'   // 分发版不带战役数据（首启自动建空库），防泄密
  },
})
console.log('staging 完成 → frontend/electron-backend-staging')

// electron-builder 会强制排除名为 node_modules 的目录（extraResources 也一样），
// 所以 staging 里改名为 nm_payload；exe 的 main.cjs 启动后端前再改回来
const nm = join(dest, 'node_modules')
const nmPayload = join(dest, 'nm_payload')
if (existsSync(nm)) {
  if (existsSync(nmPayload)) rmSync(nmPayload, { recursive: true, force: true })
  renameSync(nm, nmPayload)
  console.log('node_modules 已改名为 nm_payload（打包后由 main.cjs 改回）')
}
