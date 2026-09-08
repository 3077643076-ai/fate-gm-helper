// QQ 消息采集器（v0.5）：作为额外客户端连 NapCat 的正向 WS（OneBot v11 事件流）
// 作用：把群聊/私聊消息原样落进 message_log（全量留痕，复盘/审计/给 LLM 的上下文素材）
// 说明：NapCat 的 WS 服务（如 ws://127.0.0.1:3001）支持多客户端同时接入，
//       引擎这边只是"旁听"记录，不抢 Koishi 的消息，也不回任何东西
// 断线行为：自动重连（5 秒起步，最长退避到 60 秒），连接状态可查（面板显示用）

/** 从 OneBot 消息事件里提取纯文本（raw_message 优先；message 数组则拼 text 段） */
export function extractMessageText(event) {
  if (typeof event?.raw_message === 'string' && event.raw_message) return event.raw_message
  const m = event?.message
  if (typeof m === 'string') return m
  if (Array.isArray(m)) {
    return m.map(seg => (typeof seg === 'string' ? seg : seg?.type === 'text' ? seg.data?.text ?? '' : '')).join('')
  }
  return ''
}

/**
 * 启动消息采集器
 * @param {object} opts
 * @param {string} opts.wsUrl        NapCat WS 地址（ws://127.0.0.1:3001）
 * @param {(event: object, text: string) => void} opts.onMessage 每条群聊/私聊消息回调
 * @param {(info: {connected: boolean, note: string}) => void} [opts.onStatus] 连接状态变化回调
 * @returns {{stop: () => void, getStatus: () => ({connected: boolean, note: string})}}
 */
export function startMessageCollector({ wsUrl, onMessage, onStatus }) {
  let ws = null
  let stopped = false
  let retryDelay = 5000
  let retryTimer = null
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
      ws = new WebSocket(wsUrl)
    } catch (e) {
      setStatus(false, `WS 地址无效：${e.message}`)
      scheduleRetry()
      return
    }

    ws.onopen = () => {
      retryDelay = 5000
      setStatus(true, '已连接，监听消息中')
    }

    ws.onmessage = (buf) => {
      let event
      try { event = JSON.parse(String(buf.data)) } catch { return }
      // 只关心消息类事件；心跳/元事件/通知直接忽略
      if (event?.post_type !== 'message') return
      if (event.message_type !== 'group' && event.message_type !== 'private') return
      const text = extractMessageText(event)
      if (!text) return
      onMessage(event, text)
    }

    ws.onclose = () => {
      if (stopped) return
      setStatus(false, '连接断开，等待重连')
      scheduleRetry()
    }
    ws.onerror = () => { /* onclose 会跟着触发，这里不重复处理 */ }
  }

  function scheduleRetry() {
    if (stopped || retryTimer) return
    retryTimer = setTimeout(() => {
      retryTimer = null
      retryDelay = Math.min(retryDelay * 2, 60000)
      connect()
    }, retryDelay)
  }

  connect()

  return {
    stop() {
      stopped = true
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
      try { ws?.close() } catch { /* 忽略关闭异常 */ }
      setStatus(false, '已停止')
    },
    getStatus: () => ({ ...state }),
  }
}
