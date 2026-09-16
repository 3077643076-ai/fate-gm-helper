// 技能提交文本解析器
// 职责：把玩家在 QQ 发的技能提交文本（如 ".提交 魔境a 空花 1 3 必胜剑②"）
// 劈成结构化条目数组：技能（缩写）+ 等级 + 发动段号，并逐条匹配技能模板。
// 设计原则：纯规则零 token，匹配不上的不硬猜，标出来留给 GM 处理。

const { getDb } = require('../db');

// ---------- 基础切分 ----------

// 常见分隔符：空白、逗号、顿号、分号、斜杠、加号、竖线、换行
const SPLIT_RE = /[\s,，、;；/+|]+/u;

// 夹在连写里的动词/虚词（如"魔境a抓火炮b"的"抓"），切分时直接丢弃
const IGNORED_CONNECTORS = new Set([
  '抓', '用', '开', '交', '发', '放', '丢', '吃', '喝', '上', '下', '的', '了',
]);

// 中文数字 / 带圈数字 → 阿拉伯数字段号
const CN_DIGIT_MAP = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const CIRCLED_DIGIT_MAP = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5, '⑥': 6, '⑦': 7, '⑧': 8 };
// 字母段位（神代魔术 a/b/c/d/e 段这类）→ 段号
const LETTER_SEGMENT_MAP = { a: 1, b: 2, c: 3, d: 4, e: 5 };

// 独立 token 形如 "d级"/"D级"：玩家明确指段位（发d级效果）
function isLetterGradeSegment(token) {
  return /^[A-Ea-e]级$/u.test(token);
}

function letterToSegment(token) {
  return LETTER_SEGMENT_MAP[token[0].toLowerCase()] || null;
}

// 从 token 尾部剥掉等级（A-E / EX，可带 +/-），返回 { core, grade }
function extractGrade(token) {
  const m = token.match(/^(.*?)(EX|[A-Ea-e])[+−-]?$/u);
  if (m && m[1]) {
    return { core: m[1], grade: m[2].toUpperCase() + (/[+−-]$/u.test(token) ? (token.endsWith('+') ? '+' : '-') : '') };
  }
  return { core: token, grade: null };
}

// 从 token 尾部剥掉段号（第N段 / N / 中文数字 / 带圈数字），返回 { core, segment }
function extractTrailingSegment(token) {
  const m = token.match(/^(.*?)(?:第)?([1-9]|①②③④⑤⑥⑦⑧|[一二三四五六七八九十])段?$/u);
  if (!m || !m[1]) return { core: token, segment: null };
  const raw = m[2];
  let segment = null;
  if (/^[1-9]$/u.test(raw)) segment = Number(raw);
  else if (CIRCLED_DIGIT_MAP[raw]) segment = CIRCLED_DIGIT_MAP[raw];
  else if (CN_DIGIT_MAP[raw]) segment = CN_DIGIT_MAP[raw];
  if (segment === null) return { core: token, segment: null };
  return { core: m[1], segment };
}

// 独立 token 是不是纯等级（A / B+ / EX）
function isStandaloneGrade(token) {
  return /^(EX|[A-Ea-e])[+−-]?$/u.test(token);
}

// 独立 token 是不是纯段号（1 / 第2段 / 三 / ②）
function isStandaloneSegment(token) {
  if (/^(?:第)?[1-9]段?$/u.test(token)) return true;
  if (/^(?:第)?[一二三四五六七八九十]段?$/u.test(token)) return true;
  if (/^[①②③④⑤⑥⑦⑧]$/u.test(token)) return true;
  return false;
}

// 剥壳：去掉 ".提交 " 之类的指令前缀
function stripCommandPrefix(text) {
  return String(text || '').replace(/^\s*[.。]?\s*提交\s*/u, '').trim();
}

// 去掉 token 首尾的动词/连接字："开空花"→"空花"、"发d级"→"d级"
function stripEdgeConnectors(text) {
  let chars = [...text];
  while (chars.length && IGNORED_CONNECTORS.has(chars[0])) chars = chars.slice(1);
  while (chars.length && IGNORED_CONNECTORS.has(chars[chars.length - 1])) chars = chars.slice(0, -1);
  return chars.join('');
}

// ---------- 匹配 ----------

// 顺序子序列匹配：alias 的每个字按顺序都出现在 name 里（"空花"→"空中花园"命中）
function isSubsequenceMatch(name, alias) {
  let cursor = 0;
  for (const ch of name) {
    if (ch === alias[cursor]) cursor += 1;
    if (cursor >= alias.length) return true;
  }
  return cursor >= alias.length;
}

// 加载参与匹配的"已知词"：别名表（战役专属优先）+ 全部模板名 + 各模板 active 段俗称
function loadAliasDictionary(db, campaignId) {
  const aliases = db.prepare(`
    SELECT id, alias_text AS aliasText, template_id AS templateId, campaign_id AS aliasCampaignId
    FROM skill_alias
    WHERE campaign_id IS NULL OR campaign_id = ?
  `).all(campaignId || 0);
  const templates = db.prepare('SELECT id, name, effects_json FROM skill_template').all();
  // 段俗称词典：[{ templateId, segNo, word }]，只收 active 段（passive 常驻段开技能自动生效，不需要玩家点名）
  const effectWords = [];
  for (const t of templates) {
    let effects = [];
    try { effects = JSON.parse(t.effects_json || '[]'); } catch { effects = []; }
    effects.forEach((seg, i) => {
      if (!seg || seg.trigger === 'passive') return;
      for (const w of (Array.isArray(seg.aliases) ? seg.aliases : [])) {
        if (w) effectWords.push({ templateId: t.id, segNo: i + 1, word: w });
      }
    });
  }
  return { aliases, templates, effectWords };
}

// 三级匹配：1) 别名精确（战役专属 > 全局）2) 模板名包含缩写 3) 顺序子序列
// 返回 { templateId, templateName, matchType, candidates }
function matchAliasToTemplates(aliasText, dictionary) {
  const { aliases, templates } = dictionary;
  const clean = aliasText.trim();
  if (!clean) return { templateId: null, templateName: null, matchType: 'pending', candidates: [] };

  // 一级：别名表精确命中（同缩写对多模板时视为多候选）
  const aliasHits = aliases.filter(a => a.aliasText === clean);
  const seen = new Set();
  const aliasCandidateList = [];
  for (const hit of aliasHits) {
    if (seen.has(hit.templateId)) continue;
    seen.add(hit.templateId);
    const tpl = templates.find(t => t.id === hit.templateId);
    if (tpl) aliasCandidateList.push({ id: tpl.id, name: tpl.name });
  }
  if (aliasCandidateList.length === 1) {
    return { templateId: aliasCandidateList[0].id, templateName: aliasCandidateList[0].name, matchType: 'alias', candidates: [] };
  }
  if (aliasCandidateList.length > 1) {
    return { templateId: null, templateName: null, matchType: 'pending', candidates: aliasCandidateList };
  }

  // 二级：模板名包含缩写（"火炮"⊂"重装火炮"）
  const contains = templates.filter(t => t.name.includes(clean));
  if (contains.length === 1) {
    return { templateId: contains[0].id, templateName: contains[0].name, matchType: 'name', candidates: [] };
  }
  if (contains.length > 1) {
    return { templateId: null, templateName: null, matchType: 'pending', candidates: contains.map(t => ({ id: t.id, name: t.name })) };
  }

  // 三级：顺序子序列（"空花"→"空中花园"），命中多个也算多候选
  const subs = templates.filter(t => isSubsequenceMatch(t.name, clean));
  if (subs.length === 1) {
    return { templateId: subs[0].id, templateName: subs[0].name, matchType: 'subsequence', candidates: [] };
  }
  if (subs.length > 1) {
    return { templateId: null, templateName: null, matchType: 'pending', candidates: subs.map(t => ({ id: t.id, name: t.name })) };
  }

  return { templateId: null, templateName: null, matchType: 'pending', candidates: [] };
}

// ---------- token 流组装 ----------

// 把一段文本解析成条目数组 + 未识别碎片
// 返回 items: [{ aliasText, grade, segments, matchType, templateId, templateName, candidates }]
//      unknownShards: [没法理解的碎片]
function parseSubmissionText(text, campaignId, db) {
  const database = db || getDb();
  const dictionary = loadAliasDictionary(database, campaignId);
  const body = stripCommandPrefix(text);

  const items = [];
  const unknownShards = [];
  let current = null;

  const newMatch = () => ({
    aliasText: null, grade: null, segments: null,
    templateId: null, templateName: null, matchType: 'pending', candidates: [],
  });

  const finalizeCurrent = () => {
    if (current && current.aliasText) {
      items.push(current);
    } else if (current && (current.grade || current.segments)) {
      // 只有等级/段号没有技能名，说明顺序反了或缩写没认出来
      unknownShards.push(current.grade || String(current.segments));
    }
    current = null;
  };

  // 开新条目：缩写一确定就立刻做模板匹配，后面效果俗称挂段时要用 templateId
  const openEntry = (aliasText) => {
    finalizeCurrent();
    current = newMatch();
    current.aliasText = aliasText;
    Object.assign(current, matchAliasToTemplates(aliasText, dictionary));
  };

  // 已知词扫描：在一个无分隔符 token 里找别名/模板名出现位置（最长优先）
  function scanKnownWords(rawToken) {
    const found = [];
    for (const a of dictionary.aliases) {
      let idx = rawToken.indexOf(a.aliasText);
      while (idx !== -1) {
        found.push({ start: idx, end: idx + a.aliasText.length, text: a.aliasText });
        idx = rawToken.indexOf(a.aliasText, idx + 1);
      }
    }
    for (const t of dictionary.templates) {
      if (t.name.length < 2) continue; // 单字模板名太容易误切
      let idx = rawToken.indexOf(t.name);
      while (idx !== -1) {
        found.push({ start: idx, end: idx + t.name.length, text: t.name });
        idx = rawToken.indexOf(t.name, idx + 1);
      }
    }
    // 按 start 排序，重叠区间保留最长者
    found.sort((x, y) => (x.start - y.start) || (y.end - x.end));
    const picked = [];
    let lastEnd = 0;
    for (const f of found) {
      if (f.start >= lastEnd) {
        picked.push(f);
        lastEnd = f.end;
      }
    }
    return { picked, tokenLength: rawToken.length };
  }

  const tokens = body.split(SPLIT_RE).filter(Boolean);

  for (const token of tokens) {
    // 0) "d级"字样：玩家明确指字母段位（发d级效果）→ 归属当前条目的段号
    if (isLetterGradeSegment(token)) {
      const seg = letterToSegment(token);
      if (current && seg) {
        if (current.segments === null) current.segments = [];
        if (!current.segments.includes(seg)) current.segments.push(seg);
      } else if (seg) {
        unknownShards.push(token);
      }
      continue;
    }

    // 1) 独立等级 / 段号 → 归属当前条目
    if (isStandaloneGrade(token)) {
      if (current) current.grade = token.toUpperCase();
      else unknownShards.push(token);
      continue;
    }
    if (isStandaloneSegment(token)) {
      const seg = extractTrailingSegment(token).segment;
      if (current && seg) {
        if (current.segments === null) current.segments = [];
        if (!current.segments.includes(seg)) current.segments.push(seg);
      } else if (seg) {
        unknownShards.push(token);
      }
      continue;
    }

    // 2) 连写 token：先做已知词扫描切分
    const { picked } = scanKnownWords(token);
    if (picked.length > 0) {
      let cursor = 0;
      for (const piece of picked) {
        const gap = token.slice(cursor, piece.start);
        handleGap(gap);
        finalizeCurrent();
        current = newMatch();
        current.aliasText = piece.text;
        Object.assign(current, matchAliasToTemplates(piece.text, dictionary));
        cursor = piece.end;
      }
      handleGap(token.slice(cursor));
      continue;
    }

    // 3) 效果俗称 token（"丢群惩"/"上抗性"）：不是技能名，挂到当前条目的对应段
    const containsEffectWord = dictionary.effectWords.some(w => token.includes(w.word));
    if (containsEffectWord) {
      const effectHit = current
        ? dictionary.effectWords.find(w => current.templateId === w.templateId && token.includes(w.word))
        : null;
      if (effectHit) {
        if (current.segments === null) current.segments = [];
        if (!current.segments.includes(effectHit.segNo)) current.segments.push(effectHit.segNo);
      } else {
        // 有俗称词但当前条目对不上模板（或没有当前条目）→ 未识别
        unknownShards.push(token);
      }
      continue;
    }

    // 4) 普通词条：可能是"动词+技能名+等级+段号"连写（开空花 / 必胜剑第2段 / 发d级）
    let rest = token;
    const trailingSeg = extractTrailingSegment(rest);
    let trailingSegments = [];
    if (trailingSeg.segment && trailingSeg.core) {
      trailingSegments.push(trailingSeg.segment);
      rest = trailingSeg.core;
    }
    const g = extractGrade(rest);
    rest = g.core;

    // 去掉首尾动词/连接字后再判断
    const cleaned = stripEdgeConnectors(rest);
    if (!cleaned) continue;

    // 剥完是"d级"段位字样 → 挂当前条目段号
    if (isLetterGradeSegment(cleaned)) {
      const seg = letterToSegment(cleaned);
      if (current && seg) {
        if (current.segments === null) current.segments = [];
        if (!current.segments.includes(seg)) current.segments.push(seg);
      } else if (seg) {
        unknownShards.push(token);
      }
      continue;
    }

    openEntry(cleaned);
    if (g.grade) current.grade = g.grade;
    if (trailingSegments.length) current.segments = trailingSegments;
  }
  finalizeCurrent();

  function handleGap(gap) {
    // 两个已知词之间的碎屑（如"魔境a抓火炮"的"a抓"）：先去掉动词等连接字，再识别等级/段号
    if (!gap) return;
    const stripped = [...gap].filter(ch => !IGNORED_CONNECTORS.has(ch)).join('');
    if (!stripped) return;

    // 纯等级（"a" / "B+"）
    const headGrade = stripped.match(/^([A-Ea-e])[+−-]?$/u);
    if (headGrade) {
      if (current) current.grade = headGrade[1].toUpperCase();
      return;
    }
    // 纯段号（"2" / "第3段" / "②" / "d级"）
    if (isStandaloneSegment(stripped)) {
      const seg = extractTrailingSegment(stripped).segment;
      if (current && seg) {
        if (current.segments === null) current.segments = [];
        if (!current.segments.includes(seg)) current.segments.push(seg);
      }
      return;
    }
    if (isLetterGradeSegment(stripped)) {
      const seg = letterToSegment(stripped);
      if (current && seg) {
        if (current.segments === null) current.segments = [];
        if (!current.segments.includes(seg)) current.segments.push(seg);
      }
      return;
    }
    // 理不出含义的碎屑 → 未识别，GM 在原文里看
    unknownShards.push(gap);
  }

  return { items, unknownShards };
}

// 段俗称匹配：模板定下来后，用该模板 effects 各段的 aliases（俗称）扫原始文本，
// 玩家写了"丢群惩"而群惩罚段的 aliases 里有"群惩" → 自动勾中该段。
// 注意：只补 active 段的勾选；passive（常驻）段本来开技能就自动生效，不需要玩家点名。
function resolveSegmentsByEffect(item, rawText, db) {
  if (!item.templateId) return item;
  const tpl = db.prepare('SELECT effects_json FROM skill_template WHERE id = ?').get(item.templateId);
  if (!tpl) return item;
  let effects = [];
  try { effects = JSON.parse(tpl.effects_json || '[]'); } catch { effects = []; }
  if (!effects.length) return item;

  const text = String(rawText || '');
  for (let i = 0; i < effects.length; i += 1) {
    const seg = effects[i] || {};
    if (seg.trigger === 'passive') continue; // 常驻段不参与选段
    const aliases = Array.isArray(seg.aliases) ? seg.aliases : [];
    const hit = aliases.some(alias => alias && text.includes(alias));
    if (hit) {
      if (item.segments === null) item.segments = [];
      const segNo = i + 1;
      if (!item.segments.includes(segNo)) item.segments.push(segNo);
    }
  }
  // 玩家指了段的：把尾缀字母是否当"段位"留给 GM 判断的歧义标记带上
  if (item.segments && item.segments.length && item.grade) {
    item.gradeAmbiguous = true;
  }
  // 多段模板（>=2 段）的尾缀字母（神代魔术d 的 d）可能是段位不是等级，标歧义给 GM 翻转
  if (effects.length >= 2 && item.grade && /^[A-E]$/u.test(item.grade)) {
    item.gradeAmbiguous = true;
  }
  return item;
}

module.exports = {
  parseSubmissionText,
  matchAliasToTemplates,
  loadAliasDictionary,
  isSubsequenceMatch,
  resolveSegmentsByEffect,
  extractGrade,
  extractTrailingSegment,
  stripCommandPrefix,
};
