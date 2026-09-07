// fate-gm-tools 插件启停开关：操作 profile 的 cordis.patch.yml
// 用法：
//   node tools/toggle-fate-plugin.cjs off     停用插件（恢复日常体验，dsh 需重启）
//   node tools/toggle-fate-plugin.cjs on      启用插件
//   node tools/toggle-fate-plugin.cjs status  查看当前状态
// 原理：从 cordis.patch.yml 里移除/恢复 fate-gm-tools 的 insert 块（UTF-8 读写）
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const patchPath = join(homedir(), '.dsh', 'profiles', 'web', 'cordis.patch.yml')
const MARK_BEGIN = '# [fate-gm-tools] >>'
const MARK_END = '# << [fate-gm-tools]'

const INSERT_BLOCK = [
  MARK_BEGIN,
  '- insert:',
  '    - id: fate-gm-tools',
  "      name: 'fate-gm-tools'",
  '      config:',
  "        dbPath: 'C:/Users/fan/Desktop/medev/继续完成/fate-gm-helper/backend-node/data/gm_helper.db'",
  "        knowledgeDir: 'C:/Users/fan/Desktop/medev/继续完成/fate-gm-helper/knowledge'",
  MARK_END,
].join('\n')

const action = process.argv[2] ?? 'status'
const raw = readFileSync(patchPath, 'utf8')
const enabled = raw.includes(MARK_BEGIN)

function save(text) {
  copyFileSync(patchPath, patchPath + '.bak-toggle')
  writeFileSync(patchPath, text, 'utf8')
}

if (action === 'off') {
  if (!enabled) { console.log('已经是停用状态。'); process.exit(0) }
  const lines = raw.split('\n').filter(line => {
    const trimmed = line.trim()
    // 移除标记行之间的所有行（含标记本身）以及 insert 块的 yaml 内容行
    return true
  })
  // 按标记切割：删除 BEGIN..END 之间的内容（含标记行）
  const beginIdx = lines.findIndex(l => l.includes(MARK_BEGIN))
  const endIdx = lines.findIndex(l => l.includes(MARK_END))
  const kept = beginIdx >= 0 && endIdx > beginIdx
    ? [...lines.slice(0, beginIdx), ...lines.slice(endIdx + 1)]
    : lines
  save(kept.join('\n'))
  console.log('插件已停用（cordis.patch.yml 已移除挂载块，原文件备份为 .bak-toggle）。重启 dsh 后生效。')
} else if (action === 'on') {
  if (enabled) { console.log('已经是启用状态。'); process.exit(0) }
  save(raw.trimEnd() + '\n' + INSERT_BLOCK + '\n')
  console.log('插件已启用（insert 块已写回）。重启 dsh 后生效。')
} else {
  console.log(enabled ? '当前：启用（dsh 启动会加载插件）' : '当前：停用')
}
