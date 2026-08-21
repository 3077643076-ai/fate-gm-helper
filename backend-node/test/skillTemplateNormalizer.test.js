const assert = require('assert');
const { getDb } = require('../db');
const { formatBinding } = require('../routes/qqBindings');
const { formatSnapshot } = require('../routes/battleSheets');
const {
  normalizeSkillTemplatePayload,
  formatSkillTemplateRow,
  parseJsonText,
} = require('../lib/skillTemplateNormalizer');

const effects = [
  { kind: 'win_rate_modifier', target: 'self', value: 10, phase: '主要工序' },
];

const payload = normalizeSkillTemplatePayload({
  name: '魔力放出',
  rank: 'B',
  skillType: '技艺',
  timing: '随时',
  positionLimit: '不限',
  manaCost: '10',
  cooldown: '1',
  statModifiers: JSON.stringify({ strength: 10 }),
  effects: JSON.stringify(effects),
  conditions: [{ text: 'GM 选择筋力/耐久/敏捷之一', auto: false }],
  manualJudgment: false,
  sourceBook: '从者资源库.md',
  sourceSection: '基础资源包-技能一览/魔力放出',
  rawText: '给予自身的[筋力][耐久][敏捷]当中的任一项属性[+15/10/5]。',
  notes: '需要选择属性。',
});

assert.strictEqual(payload.name, '魔力放出');
assert.strictEqual(payload.manaCost, 10);
assert.strictEqual(payload.manualJudgment, 0);
assert.deepStrictEqual(JSON.parse(payload.effectsJson), effects);
assert.deepStrictEqual(JSON.parse(payload.conditionsJson), [{ text: 'GM 选择筋力/耐久/敏捷之一', auto: false }]);
assert.strictEqual(payload.rawText.includes('筋力'), true);

assert.deepStrictEqual(parseJsonText('{bad json', []), []);

const formatted = formatSkillTemplateRow({
  id: 1,
  name: '勇猛',
  rank: 'C',
  skill_type: '天赋',
  timing: '常驻',
  position_limit: '不限',
  mana_cost: 0,
  cooldown: 0,
  stat_modifiers: '{}',
  win_rate_modifier: 30,
  enemy_win_rate_modifier: 0,
  status_effects: null,
  effects_json: '[{"kind":"win_rate_modifier","value":30}]',
  conditions_json: '[{"text":"己方战术为强击或破袭"}]',
  manual_judgment: 0,
  source_book: '从者资源库.md',
  source_section: '勇猛',
  raw_text: '己方战术为[强击]或[破袭]。',
  notes: null,
  created_at: '2026-08-06',
  updated_at: '2026-08-06',
});

assert.strictEqual(formatted.manualJudgment, false);
assert.strictEqual(formatted.effects.length, 1);
assert.strictEqual(formatted.conditions.length, 1);

const db = getDb();
db.prepare("INSERT OR IGNORE INTO campaign (id, name, description) VALUES (999001, '绑定测试战役', 'test')").run();
db.prepare(`
  INSERT INTO qq_group_binding (platform, guild_id, campaign_id, group_name)
  VALUES ('onebot', 'test-guild', 999001, '测试群')
  ON CONFLICT(platform, guild_id) DO UPDATE SET
    campaign_id = excluded.campaign_id,
    group_name = excluded.group_name,
    updated_at = datetime('now')
`).run();
const binding = db.prepare('SELECT * FROM qq_group_binding WHERE platform = ? AND guild_id = ?').get('onebot', 'test-guild');
assert.strictEqual(binding.campaign_id, 999001);
assert.strictEqual(binding.group_name, '测试群');
const formattedBinding = formatBinding({ ...binding, campaign_name: '绑定测试战役' });
assert.deepStrictEqual(
  {
    platform: formattedBinding.platform,
    guildId: formattedBinding.guildId,
    campaignId: formattedBinding.campaignId,
    campaignName: formattedBinding.campaignName,
    groupName: formattedBinding.groupName,
  },
  {
    platform: 'onebot',
    guildId: 'test-guild',
    campaignId: 999001,
    campaignName: '绑定测试战役',
    groupName: '测试群',
  },
);
db.prepare("DELETE FROM qq_group_binding WHERE platform = 'onebot' AND guild_id = 'test-guild'").run();
db.prepare('DELETE FROM campaign WHERE id = 999001').run();

const snapshot = formatSnapshot({
  id: 1,
  battle_sheet_id: 2,
  campaign_id: 3,
  round_id: 4,
  turn_number: 5,
  title: '第5回合战斗复盘',
  summary_text: '# 战斗复盘摘要',
  snapshot_json: '{"winRateResult":{"blueFinal":65,"yellowFinal":35}}',
  created_at: '2026-08-18',
});
assert.strictEqual(snapshot.battleSheetId, 2);
assert.strictEqual(snapshot.snapshot.winRateResult.blueFinal, 65);

console.log('skillTemplateNormalizer tests passed');
