const STAT_KEYS = {
  level: ['合计等级', '基础等级', '补正等级'],
  strength: ['合计筋力', '基础筋力', '补正筋力'],
  endurance: ['合计耐久', '基础耐久', '补正耐久'],
  agility: ['合计敏捷', '基础敏捷', '补正敏捷'],
  mana: ['合计魔力', '基础魔力', '补正魔力'],
  luck: ['合计幸运', '基础幸运', '补正幸运'],
  noblePhantasm: ['合计宝具', '基础宝具', '补正宝具'],
};

function toInt(value) {
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

function splitParts(text) {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function getValueAfterKey(parts, key, combineRemaining = false) {
  const index = parts.indexOf(key);
  if (index === -1 || index >= parts.length - 1) return '';

  if (combineRemaining) {
    let value = '';
    for (let i = index + 1; i < parts.length; i++) {
      const current = parts[i];
      const next = parts[i + 1];

      // 当前这个 token 本身就是下一个字段的开头（说明中间没有值），直接结束
      if (
        current.startsWith('合计') ||
        current.startsWith('基础') ||
        current.startsWith('补正') ||
        current.startsWith('职介技能') ||
        current.startsWith('保有技能') ||
        current.startsWith('宝具') ||
        current.startsWith('工坊') ||
        current.startsWith('礼装') ||
        current.startsWith('职介') ||
        current.startsWith('代号') ||
        current.startsWith('等级')
      ) {
        break;
      }

      // 下一个 token 是下一个字段的开头，把当前这个 token 收进去后结束
      if (
        next &&
        (next.startsWith('合计') ||
          next.startsWith('基础') ||
          next.startsWith('补正') ||
          next.startsWith('职介技能') ||
          next.startsWith('保有技能') ||
          next.startsWith('宝具') ||
          next.startsWith('工坊') ||
          next.startsWith('礼装') ||
          next.startsWith('职介') ||
          next.startsWith('代号') ||
          next.startsWith('等级'))
      ) {
        value += current;
        break;
      }

      value += current + ' ';
    }
    return value.trim();
  }

  return parts[index + 1];
}

function buildStats(parts, groupIndex) {
  // groupIndex: 0=合计,1=基础,2=补正
  const [lvlKey, strKey, endKey, agiKey, manaKey, luckKey, npKey] = Object.values(STAT_KEYS).map(
    (arr) => arr[groupIndex],
  );
  return {
    level: toInt(getValueAfterKey(parts, lvlKey)),
    strength: toInt(getValueAfterKey(parts, strKey)),
    endurance: toInt(getValueAfterKey(parts, endKey)),
    agility: toInt(getValueAfterKey(parts, agiKey)),
    mana: toInt(getValueAfterKey(parts, manaKey)),
    luck: toInt(getValueAfterKey(parts, luckKey)),
    noblePhantasm: toInt(getValueAfterKey(parts, npKey)),
  };
}

export function useCharacterCardParser() {
  function parse(text, cardType = 'SERVANT') {
    if (!text || !text.trim()) {
      throw new Error('请输入角色卡文本');
    }
    if (!text.trim().startsWith('.st')) {
      throw new Error('角色卡文本格式错误，应以 .st 开头');
    }

    const parts = splitParts(text);

    if (cardType === 'MASTER') {
      // 御主角色卡解析
      return parseMasterCard(parts, text);
    } else {
      // 从者人物卡解析
      return parseServantCard(parts, text);
    }
  }

  function parseServantCard(parts, text) {
    const className = getValueAfterKey(parts, '职介') || '';
    const code = getValueAfterKey(parts, '代号') || className || '未知';

    const classSkills = [];
    for (let i = 1; i <= 3; i++) {
      const val = getValueAfterKey(parts, `职介技能${i}`, true);
      if (val) classSkills.push({ name: val, rank: '', desc: '' });
    }

    const personalSkills = [];
    for (let i = 1; i <= 3; i++) {
      const val = getValueAfterKey(parts, `保有技能${i}`, true);
      if (val) personalSkills.push({ name: val, rank: '', desc: '' });
    }

    const noblePhantasms = [];
    for (let i = 1; i <= 3; i++) {
      const val = getValueAfterKey(parts, `宝具${i}`, true);
      if (val) noblePhantasms.push({ name: val, rank: '', desc: '' });
    }

    return {
      code,
      className,
      rawText: text.trim(),
      cardType: 'SERVANT',
      totalStats: buildStats(parts, 0),
      baseStats: buildStats(parts, 1),
      correctionStats: buildStats(parts, 2),
      classSkills,
      personalSkills,
      noblePhantasms,
      workshops: null,
      craftEssences: null,
    };
  }

  function parseMasterCard(parts, text) {
    // 现在御主卡的 .st 文本也使用空格分隔，按关键字取值即可
    const code = getValueAfterKey(parts, '代号', true) || '未知';
    const className = '御主'; // 御主角色卡固定职介

    // 御主角色卡只有合计属性，没有基础和补正
    const totalStats = {
      level: toInt(getValueAfterKey(parts, '等级')),
      strength: toInt(getValueAfterKey(parts, '合计筋力')),
      endurance: toInt(getValueAfterKey(parts, '合计耐久')),
      agility: toInt(getValueAfterKey(parts, '合计敏捷')),
      mana: toInt(getValueAfterKey(parts, '合计魔力')),
      luck: toInt(getValueAfterKey(parts, '合计幸运')),
      noblePhantasm: toInt(getValueAfterKey(parts, '合计回路')),
    };

    // 工坊
    const workshops = [];
    for (let i = 1; i <= 3; i++) {
      const val = getValueAfterKey(parts, `工坊${i}`, true);
      if (val) workshops.push({ name: val, rank: '', desc: '' });
    }

    // 保有技能
    const personalSkills = [];
    for (let i = 1; i <= 3; i++) {
      const val = getValueAfterKey(parts, `保有技能${i}`, true);
      if (val) personalSkills.push({ name: val, rank: '', desc: '' });
    }

    // 礼装
    const craftEssences = [];
    for (let i = 1; i <= 3; i++) {
      const val = getValueAfterKey(parts, `礼装${i}`, true);
      if (val) craftEssences.push({ name: val, rank: '', desc: '' });
    }

    return {
      code,
      className,
      rawText: text.trim(),
      cardType: 'MASTER',
      totalStats,
      baseStats: totalStats, // 御主角色卡基础属性等于合计属性
      correctionStats: { level: 0, strength: 0, endurance: 0, agility: 0, mana: 0, luck: 0, noblePhantasm: 0 },
      classSkills: [],
      personalSkills,
      noblePhantasms: [],
      workshops,
      craftEssences,
    };
  }

  return { parse };
}

