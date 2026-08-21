import assert from 'node:assert/strict'
import {
  STATUS,
  buildSkillQueue,
  applyQueueEffects,
  getPhaseWarnings,
  createDefaultPhaseState,
  reopenPhaseAndDependents,
  isNobleOrCoreSkill,
  resolveManualJudgmentForStatusUpdate,
} from './useBattlePhaseBoard.js'

const statModifiers = JSON.stringify({ strength: 10 })
const skillTemplateMap = new Map([
  ['勇猛', { name: '勇猛', timing: '常驻', effects: [{ kind: 'win_rate_modifier', value: 30 }] }],
  ['魔力放出', { name: '魔力放出', timing: '主要工序', effects: [{ kind: 'select_stat_modifier', value: 10 }, { kind: 'win_rate_modifier', value: 5 }] }],
  ['旧模板', { name: '旧模板', timing: '战斗开始时', statModifiers, winRateModifier: 5 }],
])

const blueSlots = [
  {
    key: 'MAIN',
    label: '主力位',
    isMain: true,
    card: {
      id: 1,
      className: 'Saber',
      code: '阿尔托莉雅',
      classSkills: [],
      personalSkills: [{ name: '勇猛', rank: 'C' }, { name: '魔力放出', rank: 'B' }],
      noblePhantasms: [],
    },
  },
]

const yellowSlots = []

const queue = buildSkillQueue({ blueSlots, yellowSlots, skillTemplateMap, previousQueue: [] })
assert.equal(queue.find(item => item.skillName === '勇猛').status, STATUS.AUTO_ON)
assert.equal(queue.find(item => item.skillName === '魔力放出').status, STATUS.PENDING)

const selected = queue.map(item => item.skillName === '魔力放出'
  ? { ...item, status: STATUS.APPLIED, selectedStat: 'strength' }
  : item)
const summary = applyQueueEffects({ queue: selected, phaseKey: 'MAIN' })
assert.equal(summary.blueStats.strength, 10)
assert.equal(summary.blueWinRate, 5)
assert.deepEqual(getPhaseWarnings({ queue: selected, phaseState: { phases: { MAIN: { confirmed: false } } } }), ['主要工序尚未确认'])

const normalTemplate = { manualJudgment: false }
const forcedManualTemplate = { manualJudgment: true }
assert.equal(resolveManualJudgmentForStatusUpdate({ template: normalTemplate }, STATUS.MANUAL), true)
assert.equal(resolveManualJudgmentForStatusUpdate({ template: normalTemplate }, STATUS.APPLIED), false)
assert.equal(resolveManualJudgmentForStatusUpdate({ template: normalTemplate }, STATUS.DISABLED), false)
assert.equal(resolveManualJudgmentForStatusUpdate({ template: forcedManualTemplate }, STATUS.APPLIED), true)

const disabledPassive = queue.map(item => item.skillName === '勇猛'
  ? { ...item, status: STATUS.DISABLED }
  : item)
const disabledSummary = applyQueueEffects({ queue: disabledPassive, phaseKey: 'PASSIVE' })
assert.equal(disabledSummary.blueWinRate, 0)

const phaseState = createDefaultPhaseState()
for (const key of ['FORMATION', 'PASSIVE', 'BATTLE_START', 'INITIAL', 'MAIN', 'FINAL']) {
  phaseState.phases[key].confirmed = true
}
const reopened = reopenPhaseAndDependents(phaseState, 'INITIAL')
assert.deepEqual(reopened, ['初始工序', '主要工序', '最终工序'])
assert.equal(phaseState.phases.FORMATION.confirmed, true)
assert.equal(phaseState.phases.BATTLE_START.confirmed, true)
assert.equal(phaseState.phases.INITIAL.confirmed, false)
assert.equal(phaseState.phases.MAIN.confirmed, false)
assert.equal(phaseState.phases.FINAL.confirmed, false)

assert.equal(isNobleOrCoreSkill({ skillName: '光辉复合大神殿', template: { skillType: '宝具' } }), true)
assert.equal(isNobleOrCoreSkill({ skillName: '普通技能', originalRank: 'EX' }), true)
assert.equal(isNobleOrCoreSkill({ skillName: '普通技能', originalRank: 'A' }), false)

console.log('useBattlePhaseBoard tests passed')
