// 冒烟测试：QQ 技能提交收集链路（解析 → 提交 → 确认 → 重复标记 → 别名沉淀）
// 后端地址可用环境变量覆盖：FATE_GM_SMOKE_BASE=http://localhost:8101 node test/smoke-skill-submission.mjs
// 注意：本机 8100 可能被旧代码进程占用，建议 PORT=8101 起新后端再跑本测试
const BASE = process.env.FATE_GM_SMOKE_BASE || 'http://localhost:8100/api'

async function post(path, body) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json())
}

async function main() {
  // ---- 准备：临时战役 + 四个测试模板 + 两个别名 ----
  const campaign = await post('/campaigns', { name: `冒烟技能提交_${Date.now()}` })
  console.log(`战役 id=${campaign.id}`)

  const npKongzhong = await post('/skill-templates', {
    name: '空中花园·XX', skillType: '宝具', maxUsesPerRound: 1,
    effects: [
      { label: '第一段：全体增益', trigger: 'passive' },
      { label: '群惩罚', trigger: 'active', aliases: ['群惩', '惩罚'] },
      { label: '单体惩罚', trigger: 'active', aliases: ['单惩'] },
    ],
    rawText: '测试原文',
  })
  const npMojing = await post('/skill-templates', {
    name: '魔境·XX', skillType: '宝具', maxUsesPerRound: 0, rawText: '可反复使用',
  })
  const npBisheng = await post('/skill-templates', {
    name: '必胜剑·XX', skillType: '宝具', maxUsesPerRound: 1,
    effects: [
      { label: '第一段：威力上升', trigger: 'active' },
      { label: '第二段：必中', trigger: 'active' },
    ],
    rawText: '两段效果',
  })
  const magicShindai = await post('/skill-templates', {
    name: '神代魔术', skillType: '魔术', maxUsesPerRound: 1,
    effects: [
      { label: 'a段', trigger: 'active' },
      { label: 'b段', trigger: 'active' },
      { label: 'c段', trigger: 'active' },
      { label: 'd段：抗性上升', trigger: 'active', aliases: ['抗性'] },
      { label: 'e段', trigger: 'active' },
    ],
    rawText: '五段效果',
  })
  console.log(`模板：空中花园=${npKongzhong.id} 魔境=${npMojing.id} 必胜剑=${npBisheng.id} 神代魔术=${magicShindai.id}`)

  await post('/skill-aliases', { aliasText: '空花', templateId: npKongzhong.id, campaignId: campaign.id })
  await post('/skill-aliases', { aliasText: '魔境', templateId: npMojing.id, campaignId: campaign.id })

  // ---- 用例 1：等级提取 + 别名命中 ----
  const p1 = await post('/skill-submissions/preview', { campaignId: campaign.id, text: '魔境A' })
  assert(p1.items.length === 1, `用例1 应解析出1条，实际 ${JSON.stringify(p1.items)}`)
  assert(p1.items[0].templateId === npMojing.id, '用例1 魔境应命中别名')
  assert(p1.items[0].grade === 'A', `用例1 等级应为A，实际 ${p1.items[0].grade}`)
  console.log('用例1 通过：魔境A → 别名命中 + 等级A')

  // ---- 用例 2：连写切分 "魔境a抓火炮b"（火炮走模板名子串匹配"重装火炮"？没有，改用别名场景简化为已知名扫描） ----
  // 建"火炮"别名以便词典扫描
  const npHuoPao = await post('/skill-templates', { name: '重装火炮·XX', skillType: '宝具', rawText: '' })
  await post('/skill-aliases', { aliasText: '火炮', templateId: npHuoPao.id, campaignId: campaign.id })
  const p2 = await post('/skill-submissions/preview', { campaignId: campaign.id, text: '魔境a抓火炮b' })
  assert(p2.items.length === 2, `用例2 应切出2条，实际 ${JSON.stringify(p2.items)}`)
  assert(p2.items[0].grade === 'A' && p2.items[1].grade === 'B', `用例2 等级应为A/B，实际 ${JSON.stringify(p2.items.map(i => i.grade))}`)
  console.log('用例2 通过：魔境a抓火炮b → 两条 + 动词丢弃')

  // ---- 用例 3：段俗称 "空花 丢群惩" → 空中花园勾中群惩罚段(第2段) ----
  const p3 = await post('/skill-submissions/preview', { campaignId: campaign.id, text: '空花 丢群惩' })
  assert(p3.items.length === 1 && p3.items[0].templateId === npKongzhong.id, `用例3 空花应命中，实际 ${JSON.stringify(p3.items)}`)
  assert(JSON.stringify(p3.items[0].segments) === '[2]', `用例3 应勾中第2段，实际 ${JSON.stringify(p3.items[0].segments)}`)
  assert(p3.items[0].gradeAmbiguous === false || p3.items[0].gradeAmbiguous === undefined, '用例3 无等级不应标歧义')
  console.log('用例3 通过：空花 丢群惩 → 群惩罚段自动勾中')

  // ---- 用例 4："神代魔术 发d级" → 明确段位第4段 ----
  const p4 = await post('/skill-submissions/preview', { campaignId: campaign.id, text: '神代魔术 发d级' })
  assert(p4.items.length === 1 && p4.items[0].templateId === magicShindai.id, `用例4 神代魔术应命中（名字子串），实际 ${JSON.stringify(p4.items)}`)
  assert(JSON.stringify(p4.items[0].segments) === '[4]', `用例4 应勾中第4段，实际 ${JSON.stringify(p4.items[0].segments)}`)
  console.log('用例4 通过：发d级 → 第4段')

  // ---- 用例 5：提交落库 → 确认 → 再提交同技能 → 重复标记（魔境不限次=不标，必胜剑1次=标） ----
  const s1 = await post('/skill-submissions', { campaignId: campaign.id, qqUser: '玩家甲', unitKey: '术从', text: '魔境A 必胜剑' })
  assert(s1.status === 'pending' && s1.items.length === 2, `用例5 落库应2条待确认，实际 ${JSON.stringify(s1.items)}`)
  const c1 = await post(`/skill-submissions/${s1.id}/confirm`, { saveAliases: [] })
  assert(c1.status === 'confirmed', '用例5 确认后应为 confirmed')
  assert(c1.items.find(i => i.templateId === npMojing.id).duplicate === false, '用例5 首次魔境不重复')

  const s2 = await post('/skill-submissions', { campaignId: campaign.id, qqUser: '玩家甲', unitKey: '术从', text: '魔境B 必胜剑' })
  const c2 = await post(`/skill-submissions/${s2.id}/confirm`, {})
  const mojing2 = c2.items.find(i => i.templateId === npMojing.id)
  const bisheng2 = c2.items.find(i => i.templateId === npBisheng.id)
  assert(mojing2.duplicate === false, '用例5 魔境 maxUses=0 不限次，不应标重复')
  assert(bisheng2.duplicate === true, '用例5 必胜剑第2次应标疑似重复')
  assert(c2.hasDuplicate === true, '用例5 提交级 hasDuplicate 应为 true')
  console.log('用例5 通过：魔境不限次不标重，必胜剑第2次标疑似重复')

  // ---- 用例 6：确认时存别名 "空花" 已存在覆盖场景跳过，验证新别名沉淀 ----
  const s3 = await post('/skill-submissions', { campaignId: campaign.id, qqUser: '玩家乙', text: '空中花园·XX' })
  const c3 = await post(`/skill-submissions/${s3.id}/confirm`, { saveAliases: ['空中花园·XX'] })
  assert(c3.savedAliases && c3.savedAliases.includes('空中花园·XX'), `用例6 应沉淀别名，实际 ${JSON.stringify(c3.savedAliases)}`)
  const aliasList = await fetch(`${BASE}/skill-aliases?campaignId=${campaign.id}`).then(r => r.json())
  assert(aliasList.content.some(a => a.aliasText === '空中花园·XX'), '用例6 别名列表应有新沉淀')
  console.log('用例6 通过：确认时顺手存别名')

  // ---- 清理 ----
  for (const id of [s1.id, s2.id, s3.id]) await fetch(`${BASE}/skill-submissions/${id}`, { method: 'DELETE' })
  for (const a of aliasList.content) await fetch(`${BASE}/skill-aliases/${a.id}`, { method: 'DELETE' })
  for (const t of [npKongzhong.id, npMojing.id, npBisheng.id, magicShindai.id, npHuoPao.id]) {
    await fetch(`${BASE}/skill-templates/${t}`, { method: 'DELETE' })
  }
  await fetch(`${BASE}/campaigns/${campaign.id}`, { method: 'DELETE' })
  console.log('冒烟测试通过，临时数据已清理')
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

main().catch(err => {
  console.error('冒烟测试失败:', err.message)
  process.exit(1)
})
