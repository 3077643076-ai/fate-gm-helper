/**
 * 数据一致性 — 页面刷新后重新同步所有数据
 */
export function useDataConsistency(campaignId, { loadCharacterCards, loadLeylines, loadActionSubmissions, loadCharacterStatuses, resetRoundInfoToDefaults }) {
  async function ensureDataConsistency() {
    try {
      await loadCharacterCards()
      await loadLeylines()
      await loadActionSubmissions()
      await loadCharacterStatuses()
      console.log('数据一致性检查完成')
    } catch (err) {
      console.error('数据一致性检查失败:', err)
      resetRoundInfoToDefaults()
    }
  }

  return { ensureDataConsistency }
}
