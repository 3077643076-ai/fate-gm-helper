// 机器人连接管理 API 封装（/api/onebot/*）
import { request } from './requestUtil'

// 读连接配置（accessToken 为占位符，明文不回传）
export function getOnebotConfig() {
  return request('/api/onebot/config')
}

// 写连接配置并自动重连
export function putOnebotConfig(payload) {
  return request('/api/onebot/config', { method: 'PUT', body: JSON.stringify(payload) })
}

// 读连接状态（connected / note / enabled 等）
export function getOnebotStatus() {
  return request('/api/onebot/status')
}

// 手动重连
export function restartOnebot() {
  return request('/api/onebot/restart', { method: 'POST' })
}

// ---------- NapCat 托管（海豹式扫码登录） ----------

// 一键登录：触发全自动流程（下载 NapCat → 解压 → 配置 → 启动），立即返回
export function launchNapcat() {
  return request('/api/onebot/napcat/launch', { method: 'POST' })
}

// 登录流程进度：{ phase, progress, message, flowRunning, webuiRunning, webuiUrl }
export function getNapcatInstallStatus() {
  return request('/api/onebot/napcat/install/status')
}

// 取登录二维码：成功 { qrcode: dataurl }；失败 { fallback: 扫码页地址, reason }
export function getNapcatQrcode() {
  return request('/api/onebot/napcat/qrcode')
}

// NapCat 状态：{ configured, webuiRunning, webuiUrl }
export function getNapcatStatus() {
  return request('/api/onebot/napcat/status')
}

// 重启 NapCat（网络配置变更后让新配置生效）
export function restartNapcat() {
  return request('/api/onebot/napcat/restart', { method: 'POST' })
}
