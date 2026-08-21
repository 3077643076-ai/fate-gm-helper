import assert from 'node:assert/strict'
import { collectStatusEffectsByCharacter, formatStatusEffectNotes } from './useBattleStatusEffects.js'

const queue = [
  {
    status: 'APPLIED',
    characterId: 1,
    target: 'self',
    skillName: '毒刃',
    manualJudgment: false,
    template: { effects: [{ kind: 'status_effect', name: '中毒', level: 2 }] },
  },
  {
    status: 'AUTO_ON',
    characterId: 1,
    target: 'self',
    skillName: '抗性上升',
    manualJudgment: false,
    template: { statusEffects: '[{"name":"抗性上升","level":1}]' },
  },
  {
    status: 'PENDING',
    characterId: 2,
    target: 'self',
    skillName: '未发动',
    manualJudgment: false,
    template: { effects: [{ kind: 'status_effect', name: '灼伤', level: 1 }] },
  },
  {
    status: 'APPLIED',
    characterId: 3,
    target: 'enemy',
    skillName: '复杂目标',
    manualJudgment: false,
    template: { effects: [{ kind: 'status_effect', name: '封印', level: 1 }] },
  },
]

const byCharacter = collectStatusEffectsByCharacter(queue)
assert.equal(byCharacter.has(1), true)
assert.equal(byCharacter.has(2), false)
assert.equal(byCharacter.has(3), false)
assert.deepEqual(byCharacter.get(1).map(effect => effect.name), ['中毒', '抗性上升'])
assert.equal(formatStatusEffectNotes(byCharacter.get(1)), '中毒(2)、抗性上升')

console.log('useBattleStatusEffects tests passed')
