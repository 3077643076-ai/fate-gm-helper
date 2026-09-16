<template>
  <div>
    <div class="page-header">
      <h2>机器人连接</h2>
      <p class="subtitle">一键登录 QQ 机器人，像海豹骰一样：点按钮 → 扫码 → 完成</p>
    </div>

    <!-- 连接状态区：轮询显示当前是否已连上 NapCat -->
    <div class="status-card" :data-connected="status.connected">
      <div class="status-main">
        <span class="status-dot" />
        <div>
          <div class="status-label">{{ status.connected ? '机器人已登录，群指令可用' : '机器人未登录' }}</div>
          <div class="status-note">{{ status.note || '—' }}</div>
        </div>
      </div>
      <button class="btn" :disabled="restarting" @click="doRestart">
        {{ restarting ? '重连中…' : '手动重连' }}
      </button>
    </div>

    <!-- 静音模式：拦截一切发群消息（催交/回执/指令回复），只读不写 -->
    <div class="status-card mute-card" :data-muted="status.muted">
      <div class="status-main">
        <span class="status-dot" :class="status.muted ? 'warn' : 'ok'" />
        <div>
          <div class="status-label">{{ status.muted ? '静音中：机器人只读不发' : '正常模式：可以往群里发消息' }}</div>
          <div class="status-note">静音时催交/回执/指令回复全部拦截，收行动、查公告不受影响</div>
        </div>
      </div>
      <button class="btn" :disabled="muteToggling" @click="toggleMute">
        {{ muteToggling ? '切换中…' : (status.muted ? '解除静音（恢复发言）' : '开启静音') }}
      </button>
    </div>

    <!-- 一键扫码登录（唯一需要操作的地方） -->
    <div class="form-card">
      <h3>登录 QQ 机器人</h3>

      <!-- 第 1 步：一个大按钮 -->
      <button
        v-if="!flowStarted && !status.connected"
        class="btn primary big-btn"
        :disabled="launching"
        @click="doLaunch"
      >{{ launching ? '正在准备…' : '登录 QQ 机器人' }}</button>

      <!-- 第 2 步：自动流程进度 -->
      <div v-if="flowStarted" class="flow-progress">
        <p class="progress-text">{{ progressText }}</p>
        <div v-if="install.phase === 'downloading'" class="progress-bar">
          <div class="progress-fill" :style="{ width: (install.progress || 5) + '%' }" />
        </div>
        <p v-if="install.phase === 'error' || install.flowError" class="warn-tip">
          {{ install.message || install.flowError }}<br />
          也可以手动下载 NapCat（github.com/NapNeko/NapCatQQ 的 Releases）解压后，在下方高级选项里填解压目录。
        </p>
        <p v-if="install.webuiRunning && !qrcode && !status.connected" class="sheet-note">
          NapCat 已启动，正在获取二维码…（如果一直出不来，点
          <a :href="install.webuiUrl" target="_blank">打开扫码页</a> 去 NapCat 页面扫，效果相同）
        </p>
      </div>

      <!-- 第 3 步：二维码 -->
      <div v-if="qrcode" class="qr-box">
        <img :src="qrcode" alt="登录二维码" class="qr-img" />
        <p class="sheet-note">用机器人账号的手机 QQ 扫这个码；二维码过期会自动刷新</p>
      </div>

      <!-- 完成 -->
      <p v-if="status.connected" class="connected-tip">
        <span class="dot ok" /> 已连接——登录成功，去群里发 .指令 就能用了
      </p>

      <!-- 重启 NapCat：工作台升级过 NapCat 网络配置（如补开 HTTP 服务端）后点它生效 -->
      <div v-if="status.connected" class="form-actions">
        <button class="btn small" :disabled="napcatRestarting" @click="doRestartNapcat">
          {{ napcatRestarting ? '重启中…' : '重启 NapCat（读公告/催交报"未配置 HTTP 地址"时点）' }}
        </button>
        <span v-if="napcatMsg" class="save-msg">{{ napcatMsg }}</span>
      </div>
    </div>

    <!-- 高级选项：默认收起，普通用户不需要碰 -->
    <details class="adv-card">
      <summary>高级选项（连接参数，一般不用动）</summary>
      <div class="adv-body">
        <label class="field">
          <span class="field-label">启用机器人</span>
          <input v-model="form.enabled" type="checkbox" class="switch" />
        </label>
        <label class="field">
          <span class="field-label">NapCat WS 地址</span>
          <input v-model="form.wsUrl" type="text" placeholder="ws://127.0.0.1:3001" />
        </label>
        <label class="field">
          <span class="field-label">访问令牌 access_token</span>
          <input v-model="form.accessToken" type="password" :placeholder="hasToken ? '(已配置，留占位符则不修改)' : '留空'" />
        </label>
        <label class="field">
          <span class="field-label">机器人 QQ 号（selfId）</span>
          <input v-model="form.selfId" type="text" placeholder="715218931" />
        </label>
        <label class="field">
          <span class="field-label">NapCat 解压目录（手动安装时填）</span>
          <input v-model="form.napcatDir" type="text" placeholder="留空 = 自动下载安装到工作台数据目录" />
        </label>
        <div class="form-actions">
          <button class="btn primary" :disabled="saving" @click="doSave">
            {{ saving ? '保存中…' : '保存高级选项' }}
          </button>
          <span v-if="saveMsg" class="save-msg">{{ saveMsg }}</span>
        </div>
      </div>
    </details>

    <!-- 群内指令速查 -->
    <div class="help-card">
      <h4>群内指令</h4>
      <pre class="help-commands">.绑定战役 &lt;战役ID&gt;   .当前
.从者行动 &lt;内容&gt;     .御主行动 &lt;内容&gt;
.ra &lt;目标值&gt;         .转魔 X-Y N
.发公告 / .群公告 / .确认行动 / .改群名
.群列表 / .群成员 [群号]   .指令（查看全部）</pre>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import {
  getOnebotConfig, putOnebotConfig, getOnebotStatus, restartOnebot,
  launchNapcat, getNapcatInstallStatus, getNapcatQrcode, restartNapcat,
} from '../../services/onebot'

// 表单数据（accessToken：后端只回占位符"(已配置)"，原样传回表示不修改）
const form = ref({ enabled: false, wsUrl: '', accessToken: '', selfId: '', napcatDir: '', muted: false })
const status = ref({ connected: false, note: '加载中…', muted: false })
const saving = ref(false)
const restarting = ref(false)
const saveMsg = ref('')
const hasToken = ref(false)
const napcatRestarting = ref(false)
const napcatMsg = ref('')
const muteToggling = ref(false)

// 切换静音模式
async function toggleMute() {
  muteToggling.value = true
  try {
    const cfg = await putOnebotConfig({ muted: !status.value.muted })
    status.value.muted = !!cfg.muted
  } catch (e) {
    napcatMsg.value = `切换失败：${e.message}`
  } finally {
    muteToggling.value = false
    setTimeout(refreshStatus, 500)
  }
}

// 一键登录流程状态
const launching = ref(false)
const flowStarted = ref(false)
const install = ref({ phase: 'idle', progress: 0, message: '', flowRunning: false, webuiRunning: false, webuiUrl: null })
const qrcode = ref(null)

// 进度条文案：优先流程 message，兜底按阶段拼
const progressText = computed(() => {
  if (status.value.connected) return '已连接，一切就绪'
  if (install.value.webuiRunning && qrcode.value) return '二维码已出，请扫码'
  return install.value.message || '准备中…'
})

// 轮询句柄
let statusTimer = null   // OneBot 连接状态（5 秒）
let flowTimer = null     // 安装/启动进度（2 秒）
let qrcodeTimer = null   // 二维码刷新（3 秒，WebUI 就绪后才开始）

async function refreshStatus() {
  try {
    status.value = await getOnebotStatus()
  } catch {
    status.value = { connected: false, note: '后端不可达', muted: status.value.muted }
  }
  // 连上了就不再刷二维码
  if (status.value.connected && qrcodeTimer) {
    clearInterval(qrcodeTimer)
    qrcodeTimer = null
    qrcode.value = null
  }
}

// 登录流程进度轮询：WebUI 就绪后切换到二维码轮询
async function refreshFlow() {
  await refreshStatus() // 扫码阶段连状态一起查（2 秒粒度），连上立即变绿
  try {
    install.value = await getNapcatInstallStatus()
  } catch { /* 后端短暂不可达忽略 */ }
  if (install.value.webuiRunning && !qrcodeTimer && !status.value.connected) {
    qrcodeTimer = setInterval(pollQrcode, 3000)
    pollQrcode()
  }
  // 出错就停止进度轮询（保留错误文案展示）
  if (install.value.phase === 'error' && flowTimer) {
    clearInterval(flowTimer)
    flowTimer = null
  }
}

async function pollQrcode() {
  try {
    const r = await getNapcatQrcode()
    if (r?.qrcode) qrcode.value = r.qrcode
  } catch { /* 二维码接口是 best-effort，失败继续等 */ }
}

// 点大按钮：触发后端全自动流程
async function doLaunch() {
  launching.value = true
  try {
    await launchNapcat()
    flowStarted.value = true
    flowTimer = setInterval(refreshFlow, 2000)
    refreshFlow()
  } catch (e) {
    install.value.phase = 'error'
    install.value.message = `启动失败：${e.message}`
  } finally {
    launching.value = false
  }
}

onMounted(async () => {
  try {
    const cfg = await getOnebotConfig()
    form.value = {
      enabled: !!cfg.enabled,
      wsUrl: cfg.wsUrl || '',
      accessToken: cfg.accessToken || '',
      selfId: cfg.selfId || '',
      napcatDir: cfg.napcatDir || '',
      muted: !!cfg.muted,
    }
    hasToken.value = cfg.accessToken === '(已配置)'
  } catch {
    saveMsg.value = '读取配置失败'
  }
  refreshStatus()
  statusTimer = setInterval(refreshStatus, 5000)
})

onUnmounted(() => {
  for (const t of [statusTimer, flowTimer, qrcodeTimer]) {
    if (t) clearInterval(t)
  }
})

// 保存高级选项
async function doSave() {
  saving.value = true
  saveMsg.value = ''
  try {
    const cfg = await putOnebotConfig({
      enabled: form.value.enabled,
      wsUrl: form.value.wsUrl,
      accessToken: form.value.accessToken,
      selfId: form.value.selfId,
      napcatDir: form.value.napcatDir,
      muted: form.value.muted,
    })
    // 后端保存后返回的 accessToken 只会是 '(已配置)'（配置了令牌）或 ''（未配置）
    hasToken.value = cfg.accessToken === '(已配置)'
    form.value.accessToken = cfg.accessToken || ''
    saveMsg.value = '已保存'
  } catch (e) {
    saveMsg.value = `保存失败：${e.message}`
  } finally {
    saving.value = false
    refreshStatus()
  }
}

async function doRestart() {
  restarting.value = true
  try {
    await restartOnebot()
  } finally {
    restarting.value = false
    setTimeout(refreshStatus, 500)
  }
}

// 重启 NapCat：onebot11.json 被（工作台）升级补开 HTTP 服务端后，重启进程生效
async function doRestartNapcat() {
  napcatRestarting.value = true
  napcatMsg.value = ''
  try {
    await restartNapcat()
    napcatMsg.value = 'NapCat 已重启（约 10 秒后完全就绪）'
  } catch (e) {
    napcatMsg.value = `重启失败：${e.message}`
  } finally {
    napcatRestarting.value = false
    setTimeout(refreshStatus, 3000)
  }
}

// watch 消掉 unused 提示（flowStarted 变化时同步开定时器的逻辑已在 doLaunch 里）
watch(flowStarted, () => { })
</script>

<style scoped>
.page-header h2 { margin: 0 0 0.35rem; }
.subtitle { color: var(--c-ink-2); font-size: 0.9rem; margin: 0 0 1rem; }

.status-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border: 1px solid var(--c-line);
  border-radius: var(--radius);
  padding: 0.9rem 1.1rem;
  margin-bottom: 1rem;
  background: var(--c-paper);
}
.status-main { display: flex; align-items: center; gap: 0.7rem; }
.status-dot { width: 10px; height: 10px; border-radius: 50%; background: #c0c0c0; flex: none; }
.status-card[data-connected="true"] .status-dot { background: var(--c-ok); }
.mute-card[data-muted="true"] { border-color: #d9a92e; }
.mute-card .status-dot.warn { background: #d9a92e; }
.status-label { font-weight: 600; }
.status-note { font-size: 0.85rem; color: var(--c-ink-2); }

.form-card {
  border: 1px solid var(--c-line);
  border-radius: var(--radius);
  padding: 1.1rem;
  margin-bottom: 1rem;
  background: var(--c-paper);
}
.form-card h3 { margin: 0 0 0.8rem; font-size: 0.95rem; color: var(--c-primary); }

.big-btn {
  width: 100%;
  padding: 0.9rem;
  font-size: 1.05rem;
  font-weight: 600;
}

.flow-progress { margin-top: 0.8rem; }
.progress-text { font-size: 0.92rem; font-weight: 600; margin: 0 0 0.4rem; }
.progress-bar {
  height: 8px;
  background: var(--c-head);
  border-radius: var(--radius);
  overflow: hidden;
  margin-bottom: 0.5rem;
}
.progress-fill {
  height: 100%;
  background: var(--c-primary);
  border-radius: var(--radius);
  transition: width 0.4s ease;
}

.qr-box { text-align: center; padding: 0.8rem 0 0.3rem; }
.qr-img {
  width: 220px;
  height: 220px;
  border: 1px solid var(--c-line);
  border-radius: var(--radius);
  background: #fff;
}
.connected-tip {
  margin: 0.8rem 0 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--c-ok);
}

/* 高级选项折叠卡 */
.adv-card {
  border: 1px solid var(--c-line);
  border-radius: var(--radius);
  padding: 0.8rem 1.1rem;
  margin-bottom: 1rem;
  background: var(--c-paper);
}
.adv-card summary {
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--c-ink-2);
  user-select: none;
}
.adv-body { padding-top: 0.9rem; }

.field { display: flex; align-items: center; gap: 0.8rem; margin-bottom: 0.7rem; }
.field-label { width: 210px; flex: none; font-size: 0.88rem; color: var(--c-ink-2); }
.field input[type="text"],
.field input[type="password"] {
  flex: 1;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--radius);
  font-size: 0.88rem;
}
.field input:focus { outline: none; border-color: var(--c-primary); }
.form-actions { display: flex; align-items: center; gap: 0.8rem; margin-top: 0.5rem; }
.save-msg { font-size: 0.85rem; color: var(--c-ink-2); }

.help-card {
  border: 1px solid var(--c-line);
  border-radius: var(--radius);
  padding: 1.1rem;
  background: var(--c-paper);
}
.help-card h4 { margin: 0 0 0.5rem; font-size: 0.88rem; color: var(--c-primary); }
.help-commands {
  margin: 0;
  background: var(--c-head);
  border-radius: var(--radius);
  padding: 0.7rem 0.9rem;
  font-size: 0.85rem;
  line-height: 1.7;
  overflow-x: auto;
}
</style>
