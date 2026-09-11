// 假 NapCat：本地模拟 OneBot HTTP 接口，让「QQ 公告收集」整条链路可以脱离真 QQ 测试
//
// 覆盖引擎用到的三个接口（qqport.mjs 的全部依赖）：
//   POST /_get_group_notice   → 返回该群预置公告（最新在前）
//   POST /send_group_msg      → 引擎发出的回执/催办，打印到控制台并记入发件箱
//   POST /_send_group_notice  → 引擎回写公告（更新该群公告内容）
//   其他 action               → retcode 0 空响应（不炸调用方）
//
// 公告内容来自 tools/mock-napcat.json（每次请求都重读文件——改完公告存盘即生效，不用重启）：
//   { "groups": { "30001": ["最新公告", "旧公告"], "30002": [], ... } }
// 没有配置文件时用内置样例（弓/术/枪 三私组）。
//
// 用法：node tools/mock-napcat.mjs [端口=3000]
// 状态页：浏览器开 http://127.0.0.1:<端口>/ 看公告与发件箱
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.argv[2]) || 3000
const defaultConfig = join(dirname(fileURLToPath(import.meta.url)), 'mock-napcat.json')

// 内置样例（没有 mock-napcat.json 时的兜底）：多动/别名后补/解析失败/未交 四种情况各占其一
const BUILTIN = {
  groups: {
    '30002': ['第2天昼 | 从者：魂食遮断 灵脉-A 然后机动 灵脉-B | 御主 休整'], // 术：多动切分
    '30001': ['第2天昼 | 从者：搓空花 | 御主：情报调查 吕布'],                 // 弓：一条进需裁决
    '30003': [],                                                              // 枪：未交 → 催办
  },
}

const configPath = existsSync(defaultConfig) ? defaultConfig : null
const outbox = []        // 引擎发来的群消息 [{groupId, text, at}]
const noticeWrites = []  // 引擎回写的公告 [{groupId, content, at}]
const noticeOverlay = {} // 引擎回写后的公告覆盖层（内存，重启即清；叠在配置之上）

function loadConfig() {
  let base = BUILTIN
  if (configPath) {
    try {
      const raw = JSON.parse(readFileSync(configPath, 'utf8'))
      if (raw?.groups) base = raw
    } catch (e) {
      console.error(`[mock] 配置文件解析失败（${e.message}），暂用内置样例`)
    }
  }
  const groups = { ...(base.groups ?? {}) }
  for (const [gid, arr] of Object.entries(noticeOverlay)) groups[gid] = arr
  return { groups }
}

function ts() { return new Date().toTimeString().slice(0, 8) }

const server = createServer((req, res) => {
  // 状态页
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
    const cfg = loadConfig()
    const lines = [
      `假 NapCat 运行中（端口 ${PORT}）`,
      configPath ? `公告配置：${configPath}（改完存盘即生效）` : '公告配置：内置样例（无 mock-napcat.json）',
      '',
      '── 各群公告 ──',
      ...Object.entries(cfg.groups).map(([gid, arr]) =>
        `  ${gid}：${arr.length ? arr.length + ' 条，最新：' + String(arr[0]).slice(0, 60) : '（无公告 → 未交）'}`),
      '',
      `── 发件箱（回执/催办，共 ${outbox.length} 条）──`,
      ...outbox.slice(-20).map(m => `  [${m.at}] → 群${m.groupId}：${m.text}`),
      '',
      `── 公告回写（共 ${noticeWrites.length} 次）──`,
      ...noticeWrites.slice(-10).map(m => `  [${m.at}] 群${m.groupId}：${String(m.content).slice(0, 80)}`),
    ]
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(lines.join('\n'))
    return
  }

  if (req.method !== 'POST') { res.writeHead(404); res.end(); return }

  let body = ''
  req.on('data', c => { body += c })
  req.on('end', () => {
    let params = {}
    try { params = JSON.parse(body || '{}') } catch { /* 空参数容忍 */ }
    const action = (req.url || '/').replace(/^\//, '').split('?')[0]
    const gid = params.group_id ?? params.groupId ?? '?'

    if (action === '_get_group_notice') {
      const cfg = loadConfig()
      const arr = cfg.groups?.[String(gid)] ?? []
      console.log(`[${ts()}] 读公告 ← 群${gid}：${arr.length} 条${arr.length ? '，最新：' + String(arr[0]).slice(0, 40) : '（无）'}`)
      reply(res, {
        retcode: 0, status: 'async', data: arr.map((text, i) => ({
          message: { text },
          publish_time: Math.floor(Date.now() / 1000) - i * 600,
        })),
      })
      return
    }

    if (action === 'send_group_msg') {
      const text = String(params.message ?? '')
      outbox.push({ groupId: gid, text, at: ts() })
      console.log(`[${ts()}] 群消息 → 群${gid}：${text}`)
      reply(res, { retcode: 0, data: { message_id: outbox.length } })
      return
    }

    if (action === '_send_group_notice') {
      const content = String(params.content ?? '')
      noticeOverlay[String(gid)] = [content, ...(loadConfig().groups?.[String(gid)] ?? [])]
      noticeWrites.push({ groupId: gid, content, at: ts() })
      console.log(`[${ts()}] 发公告 → 群${gid}：${content.slice(0, 60)}（该群公告已被覆盖，后续读取返回新内容）`)
      reply(res, { retcode: 0, data: null })
      return
    }

    console.log(`[${ts()}] 未模拟的接口 ${action}（返回空成功）`)
    reply(res, { retcode: 0, data: {} })
  })
})

function reply(res, obj) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}

server.listen(PORT, () => {
  console.log(`假 NapCat 已启动：http://127.0.0.1:${PORT}`)
  console.log(`  面板 NapCat 地址填 http://127.0.0.1:${PORT}`)
  console.log(`  状态页：http://127.0.0.1:${PORT}/`)
  console.log(configPath ? `  公告配置：${configPath}（存盘即生效）` : '  公告配置：内置样例')
})
