const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = __dirname;
const RANK_COST = { A: 5, B: 4, C: 3, D: 2, E: 1 };

function readCards(dirName) {
  const dir = path.join(ROOT, dirName);
  return fs.readdirSync(dir)
    .filter(file => file.endsWith('.st'))
    .map(file => ({ file, text: fs.readFileSync(path.join(dir, file), 'utf8').trim() }));
}

function parts(text) {
  return text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
}

function value(tokens, key) {
  const index = tokens.indexOf(key);
  if (index === -1 || index >= tokens.length - 1) return '';
  return tokens[index + 1];
}

function number(tokens, key) {
  return Number(value(tokens, key)) || 0;
}

function rankCost(name) {
  const match = String(name || '').match(/([ABCDE])$/);
  return match ? RANK_COST[match[1]] : 0;
}

function namedValues(tokens, prefix, count) {
  const result = [];
  for (let i = 1; i <= count; i++) {
    const item = value(tokens, `${prefix}${i}`);
    if (item) result.push(item);
  }
  return result;
}

const CLASS_BASE_STATS = {
  Saber: { strength: 20, endurance: 30, agility: 20, mana: 10, luck: 20 },
  Lancer: { strength: 10, endurance: 10, agility: 30, mana: 10, luck: 10 },
  Archer: { strength: 10, endurance: 10, agility: 10, mana: 0, luck: 20 },
  Rider: { strength: 0, endurance: 30, agility: 0, mana: 0, luck: 20 },
  Caster: { strength: 0, endurance: 0, agility: 0, mana: 30, luck: 0 },
  Assassin: { strength: 0, endurance: 0, agility: 20, mana: 0, luck: 20 },
  Berserker: { strength: 0, endurance: 0, agility: 0, mana: 0, luck: 0 },
};

const STAT_KEYS = ['strength', 'endurance', 'agility', 'mana', 'luck'];
const STAT_LABELS = {
  strength: '筋力',
  endurance: '耐久',
  agility: '敏捷',
  mana: '魔力',
  luck: '幸运',
};

function servantSpentRp(tokens) {
  const skillRp = [
    ...namedValues(tokens, '职介技能', 3),
    ...namedValues(tokens, '保有技能', 3),
    ...namedValues(tokens, '宝具', 3),
  ].reduce((sum, name) => sum + rankCost(name), 0);
  return skillRp;
}

function servantAllocatedStats(tokens) {
  const className = value(tokens, '职介');
  const base = CLASS_BASE_STATS[className];
  assert.ok(base, `未知职介：${className}`);
  let total = 0;
  for (const key of STAT_KEYS) {
    const current = number(tokens, `基础${STAT_LABELS[key]}`);
    const allocated = current - base[key];
    assert.ok(allocated >= 0, `${value(tokens, '代号')} 的${STAT_LABELS[key]}低于职介基础值`);
    assert.ok(allocated <= 60, `${value(tokens, '代号')} 的${STAT_LABELS[key]}分配超过 60`);
    assert.strictEqual(allocated % 5, 0, `${value(tokens, '代号')} 的${STAT_LABELS[key]}分配不是 5 的倍数`);
    total += allocated;
  }
  return total;
}

function highestNoblePhantasmValue(tokens) {
  return Math.max(...namedValues(tokens, '宝具', 3).map(name => {
    const match = String(name || '').match(/([ABCDE])$/);
    if (!match) return 0;
    return { A: 50, B: 40, C: 30, D: 20, E: 10 }[match[1]] || 0;
  }), 0);
}

function masterSpentRp(tokens) {
  const skillRp = namedValues(tokens, '保有技能', 3).reduce((sum, name) => sum + rankCost(name), 0);
  const extraWorkshopRp = Math.max(0, namedValues(tokens, '工坊', 3).length - 1);
  const extraEssenceRp = Math.max(0, namedValues(tokens, '礼装', 3).length - 1) * 2;
  return skillRp + extraWorkshopRp + extraEssenceRp;
}

function masterAllocatedStats(tokens) {
  const statKeys = ['合计筋力', '合计耐久', '合计敏捷', '合计魔力', '合计幸运', '合计回路'];
  let total = 0;
  for (const key of statKeys) {
    const current = number(tokens, key);
    assert.ok(current >= 0, `${value(tokens, '代号')} 的${key}不能为负`);
    assert.ok(current <= 50, `${value(tokens, '代号')} 的${key}超过分配上限 50`);
    assert.strictEqual(current % 5, 0, `${value(tokens, '代号')} 的${key}不是 5 的倍数`);
    total += current;
  }
  return total;
}

const servants = readCards('从者');
const masters = readCards('御主');
assert.strictEqual(servants.length, 7, '应该有 7 张从者测试卡');
assert.strictEqual(masters.length, 7, '应该有 7 张御主测试卡');

for (const card of servants) {
  assert.ok(card.text.startsWith('.st'), `${card.file} 必须以 .st 开头`);
  const tokens = parts(card.text);
  assert.ok(value(tokens, '职介'), `${card.file} 缺少职介`);
  assert.ok(value(tokens, '代号'), `${card.file} 缺少代号`);
  assert.strictEqual(number(tokens, '基础等级'), 70, `${card.file} 从者测试卡应使用最高初始等级 Lv70`);
  assert.strictEqual(number(tokens, '合计等级'), number(tokens, '基础等级'), `${card.file} 合计等级应等于基础等级`);
  assert.strictEqual(number(tokens, '基础宝具'), highestNoblePhantasmValue(tokens), `${card.file} 宝具属性应取最高宝具等级`);
  assert.ok(servantAllocatedStats(tokens) <= 160, `${card.file} 分配属性超出 Lv70 的 160 点`);
  assert.ok(servantSpentRp(tokens) <= 24, `${card.file} 技能/宝具超出 24RP：${servantSpentRp(tokens)}`);
}

for (const card of masters) {
  assert.ok(card.text.startsWith('.st'), `${card.file} 必须以 .st 开头`);
  const tokens = parts(card.text);
  assert.ok(value(tokens, '代号'), `${card.file} 缺少代号`);
  assert.strictEqual(number(tokens, '等级'), 40, `${card.file} 御主测试卡应使用最高初始等级 Lv40`);
  assert.strictEqual(masterAllocatedStats(tokens), 60, `${card.file} 御主可分配属性应为 60 点`);
  assert.ok(masterSpentRp(tokens) <= 24, `${card.file} 技能/栏位/礼装超出 24RP：${masterSpentRp(tokens)}`);
}

console.log('test cards validated');
