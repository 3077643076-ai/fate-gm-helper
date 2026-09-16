// 用途：找 U 盘盘符（备份/同步脚本共用），避免把盘符硬编码成 E: 写错盘
// 规则：
//   ① 显式传盘符最优先（用户最清楚插的是哪个）
//   ② 否则自动找"根目录下已有 圣杯GM数据备份 文件夹"的盘；多个就取最近改动的那个
//   ③ 都找不到就返回 letter=null，由调用方报错——绝不静默往某个固定盘符新建目录
//     （U 盘在 A 机器是 E:、在 B 机器可能是 H:，写错盘等于没备份，而且不易发现）
import fs from 'node:fs'

export const BACKUP_DIR_NAME = '圣杯GM数据备份'

// 'h' / 'H:' / 'H:\\' 都归一成 'H'
export function normalizeDrive(input) {
  const m = String(input ?? '').match(/[A-Za-z]/)
  return m ? m[0].toUpperCase() : null
}

// 返回 { letter, note }：letter 为 null 表示没找到，note 里写原因
export function findUsbDrive(explicit) {
  if (explicit !== undefined && explicit !== null && String(explicit).trim() !== '') {
    const letter = normalizeDrive(explicit)
    if (!letter) return { letter: null, note: `盘符参数无法识别：${explicit}` }
    try {
      if (!fs.existsSync(`${letter}:\\`)) return { letter: null, note: `${letter}: 盘不存在（U 盘没插好或盘符不对）` }
    } catch (err) {
      return { letter: null, note: `${letter}: 读不到（${err.message}）` }
    }
    return { letter, note: '按参数指定' }
  }

  const candidates = []
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const root = `${letter}:\\`
    try {
      if (!fs.existsSync(root)) continue
      const target = `${root}${BACKUP_DIR_NAME}`
      if (fs.existsSync(target)) candidates.push({ letter, mtime: fs.statSync(target).mtimeMs })
    } catch {
      // 光驱/断链/无权限的盘直接跳过
    }
  }
  if (candidates.length === 0) {
    return { letter: null, note: `所有盘符根目录下都没有「${BACKUP_DIR_NAME}」文件夹（在 U 盘上跑过一次备份后就能自动认了）` }
  }
  candidates.sort((a, b) => b.mtime - a.mtime)
  const note = candidates.length > 1
    ? `自动识别，多个盘都有该文件夹（${candidates.map((c) => c.letter).join('/')}），取最近改动的`
    : '自动识别'
  return { letter: candidates[0].letter, note }
}
