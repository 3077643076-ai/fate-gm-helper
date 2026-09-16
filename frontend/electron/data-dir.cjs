// 便携版"数据目录"挑选逻辑（纯函数，不依赖 Electron，方便 node 直接测）
//
// 背景：electron-builder 的 portable 目标会把程序解包到 %TEMP% 再运行，
//   所以 __dirname/resourcesPath 都是临时目录 —— 数据放那儿等于每次启动都丢。
//   数据必须落在 exe 真正所在的目录旁边（或其上级的项目目录），由这里决定。
//
// 优先级：
//   1. 环境变量 FATE_DATA_DIR（外部显式指定，测试/多开用）
//   2. 未打包运行（npm run electron / npx electron .）→ backend-node/data（开发时和 npm start 共用）
//   3. exe 旁边已经有 data/ → 用它（说明这是"拷到别处的独立副本"，就让它自带一套数据）
//   4. exe 上级有 backend-node/data → 用项目里的那份
//      （exe 就在项目 desktop/ 里时走这条：和"启动GM工作台.bat"的托盘后端共用同一个库，
//        不会出现两份数据各存一半的糊涂账）
//   5. 都没有 → exe 旁边的 data/（拷到干净目录双击，首启自动建空库）
const fs = require('node:fs');
const path = require('node:path');

function resolveDataDir({ packaged, exeDir, backendDir, env } = {}) {
  const envDir = env && env.FATE_DATA_DIR
  if (envDir) return { dir: path.resolve(envDir), reason: 'FATE_DATA_DIR 指定' }

  if (!packaged) {
    return { dir: path.join(backendDir, 'data'), reason: '开发运行，用项目 backend-node/data' }
  }

  const beside = path.join(exeDir, 'data')
  if (fs.existsSync(beside)) return { dir: beside, reason: 'exe 旁边已有 data/' }

  const projectData = path.resolve(exeDir, '..', 'backend-node', 'data')
  if (fs.existsSync(projectData)) return { dir: projectData, reason: 'exe 上级有 backend-node/data（与托盘共用同一套数据）' }

  return { dir: beside, reason: '新建在 exe 旁边（独立空库）' }
}

module.exports = { resolveDataDir };
