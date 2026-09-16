// OneBot v11 正向 WebSocket 客户端（指令机器人专用）
// 作用：作为"另一个客户端"连 NapCat 的正向 WS，收消息事件 + 调 OneBot 动作（发消息/改群名等）
// 和 engine/qqws.mjs（AI 助手的旁听器）是两套独立连接，互不影响；
// NapCat 的正向 WS 支持多个客户端同时接入，所以可以并存。
// 断线行为：自动重连（5 秒起步，指数退避到最长 60 秒），与 qqws.mjs 同款策略。

// 生成自增 echo 号：每次调用动作带一个唯一 echo，用来把 NapCat 的响应对回这次调用
let echoSeq = 0

/**
 * 启动机器人连接
 * @param {object} opts
 * @param {string} opts.wsUrl       NapCat 正向 WS 地址（如 ws://127.0.0.1:3001）
 * @param {string} [opts.accessToken] NapCat 配置的 access_token（没设就不带鉴权头）
 * @param {(event: object) => void} opts.onEvent   收到 OneBot 事件（消息/心跳/元事件）时回调
 * @param {(info: {connected: boolean, note: string}) => void} [opts.onStatus] 连接状态变化回调
 * @returns {{stop: () => void, call: (action: string, params?: object) => Promise<any>,
 *             getStatus: () => ({connected: boolean, note: string})}}
 */
function startOnebotBot({ wsUrl, accessToken, onEvent, onStatus }) {
  let ws = null
  let stopped = false
  let retryDelay = 5000
  let retryTimer = null
  // echo -> {resolve, reject, timer}：等待响应的调用表，echo 号是 key
  const pendingCalls = new Map()
  const state = { connected: false, note: '未启动' }

  function setStatus(connected, note) {
    state.connected = connected
    state.note = note
    if (onStatus) onStatus({ ...state })
  }

  function connect() {
    if (stopped) return
    setStatus(false, `连接中 ${wsUrl} …`)
    try {
      // Node 22+ 内置的 WebSocket 客户端（项目 db.js 也依赖 node:sqlite，
      // 说明目标运行环境足够新，这里直接用全局 WebSocket，不引第三方包）
      ws = new WebSocket(wsUrl, {
        headers: accessToken
          ? { Authorization: `Bearer ${accessToken}` }
          : undefined,
      })
    } catch (e) {
      setStatus(false, `WS 地址无效：${e.message}`)
      scheduleRetry()
      return
    }

    ws.onopen = () => {
      retryDelay = 5000
      setStatus(true, '已连接')
    }

    ws.onmessage = (buf) => {
      let data
      try { data = JSON.parse(String(buf.data)) } catch { return }

      // 带 echo 的报文 = 我发出去的某个动作的响应，交给等待中的调用
      if (data && data.echo !== undefined) {
        const waiting = pendingCalls.get(data.echo)
        if (!waiting) return
        pendingCalls.delete(data.echo)
        clearTimeout(waiting.timer)
        // OneBot 响应：retcode 0=成功，1=已提交异步（视为成功）
        if (data.retcode === 0 || data.retcode === 1) {
          waiting.resolve(data.data)
        } else {
          // NapCat 已响应但业务失败（如群不存在）：标记 fromNapcat，
          // 上层据此区分"连接层失败（可回落 HTTP）"和"业务失败（直接上抛）"
          const err = new Error(data.message ?? data.wording ?? `retcode ${data.retcode}`)
          err.fromNapcat = true
          waiting.reject(err)
        }
        return
      }

      // 其余报文 = 事件（消息/心跳/生命周期等），原样上抛给分发层
      if (onEvent) onEvent(data)
    }

    ws.onclose = () => {
      failAllPending('连接已断开')
      if (stopped) return
      setStatus(false, '连接断开，等待重连')
      scheduleRetry()
    }
    ws.onerror = () => { /* onclose 会跟着触发，这里不重复处理 */ }
  }

  // 连接断开时把所有等待中的动作调用统一报错，避免调用方永远挂在 await 上
  function failAllPending(reason) {
    for (const [echo, waiting] of pendingCalls) {
      clearTimeout(waiting.timer)
      waiting.reject(new Error(reason))
      pendingCalls.delete(echo)
    }
  }

  function scheduleRetry() {
    if (stopped || retryTimer) return
    retryTimer = setTimeout(() => {
      retryTimer = null
      // 退避上限 15 秒：扫码登录成功后 NapCat 才开 WS 端口，
      // 退避太长会导致"扫完码半天不自动连上"的体验问题
      retryDelay = Math.min(retryDelay * 2, 15000)
      connect()
    }, retryDelay)
  }

  /**
   * 立即重连（跳过退避等待）：外部（如安装状态轮询）发现 NapCat 已就绪时调用，
   * 让扫码成功后的连接感知从"最长 15 秒"变成"1-2 秒"
   */
  function reconnectNow() {
    if (stopped) return
    if (ws && ws.readyState === 1) return // 已连接就不用动
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
    retryDelay = 5000 // 重置退避
    connect()
  }

  /**
   * 调用一个 OneBot 动作（如 send_group_msg / set_group_name）
   * 走 WS 下发 {action, params, echo}，等 NapCat 回带同一 echo 的响应
   */
  function call(action, params = {}) {
    if (stopped) return Promise.reject(new Error('机器人已停止'))
    if (!ws || ws.readyState !== 1) return Promise.reject(new Error('WS 未连接，无法调用动作'))
    const echo = `call_${Date.now()}_${++echoSeq}`
    return new Promise((resolve, reject) => {
      // 10 秒没等到响应按超时失败，防止调用方永久等待
      const timer = setTimeout(() => {
        pendingCalls.delete(echo)
        reject(new Error(`动作 ${action} 响应超时（10 秒）`))
      }, 10000)
      pendingCalls.set(echo, { resolve, reject, timer })
      ws.send(JSON.stringify({ action, params, echo }))
    })
  }

  connect()

  return {
    stop() {
      stopped = true
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
      failAllPending('机器人已停止')
      try { ws?.close() } catch { /* 忽略关闭异常 */ }
      setStatus(false, '已停止')
    },
    call,
    reconnectNow,
    getStatus: () => ({ ...state }),
  }
}

module.exports = { startOnebotBot }
