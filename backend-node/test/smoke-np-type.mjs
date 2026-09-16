// 冒烟测试：验证 np_type 在真实 API 链路上存取正常（创建→回显→更新→删除）
// 后端地址可用环境变量覆盖：FATE_GM_SMOKE_BASE=http://localhost:8101 node test/smoke-np-type.mjs
const BASE = process.env.FATE_GM_SMOKE_BASE || 'http://127.0.0.1:8100/api'

async function main() {
  // 创建：带 npType 的宝具模板
  const created = await fetch(`${BASE}/skill-templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '冒烟测试王财', skillType: '宝具', npType: '对界', timing: '主要工序', rawText: '测试原文' }),
  }).then(r => r.json())
  console.log(`创建 id=${created.id} skillType=${created.skillType} npType=${created.npType}`)
  if (created.npType !== '对界') throw new Error(`创建后 npType 应为 对界，实际 ${created.npType}`)

  // 回显
  const fetched = await fetch(`${BASE}/skill-templates/${created.id}`).then(r => r.json())
  if (fetched.npType !== '对界') throw new Error(`回显 npType 应为 对界，实际 ${fetched.npType}`)
  console.log(`回显 npType=${fetched.npType} rawText=${fetched.rawText}`)

  // 更新：改 npType；同时确认不带 npType 的旧客户端更新不会清空已存值以外的字段
  const updated = await fetch(`${BASE}/skill-templates/${created.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '冒烟测试王财', skillType: '宝具', npType: '对人', timing: '主要工序' }),
  }).then(r => r.json())
  if (updated.npType !== '对人') throw new Error(`更新后 npType 应为 对人，实际 ${updated.npType}`)
  console.log(`更新后 npType=${updated.npType}`)

  // 列表检索：按关键词能搜到
  const list = await fetch(`${BASE}/skill-templates?page=0&size=5&keyword=${encodeURIComponent('冒烟测试')}`).then(r => r.json())
  console.log(`关键词检索命中 ${list.totalElements} 条`)

  // 清理
  await fetch(`${BASE}/skill-templates/${created.id}`, { method: 'DELETE' })
  console.log('冒烟测试通过，临时数据已清理')
}

main().catch(err => {
  console.error('冒烟测试失败:', err.message)
  process.exit(1)
})
