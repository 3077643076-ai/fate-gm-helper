import * as XLSX from 'xlsx';

/**
 * 从 sheet 中读取指定单元格的数值
 * Excel 模板中的公式单元格会读取缓存值（cell.v）
 * 如果值为空或无效，返回 0
 */
function readCellNumber(sheet, cellAddr) {
  const cell = sheet[cellAddr];
  if (!cell) return 0;
  // cell.v 是原始值（公式的缓存结果），cell.w 是格式化文本
  const val = cell.v !== undefined ? cell.v : cell.w;
  const n = Number(val);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * 从 sheet 中读取指定单元格的文本
 * 去掉首尾空格，空单元格返回空字符串
 */
function readCellText(sheet, cellAddr) {
  const cell = sheet[cellAddr];
  if (!cell) return '';
  const val = cell.v !== undefined ? cell.v : (cell.w || '');
  return String(val).trim();
}

/**
 * 从 sheet 中读取逗号分隔的文本，返回字符串数组
 * 支持中英文逗号、顿号分隔，空单元格返回空数组
 */
function readCellList(sheet, cellAddr) {
  const text = readCellText(sheet, cellAddr);
  if (!text) return [];
  return text.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
}

/**
 * 拼接两个单元格的文本（如技能名称C列 + 等级F列 → "对魔力 B"）
 */
function joinCellText(sheet, nameAddr, rankAddr) {
  const name = readCellText(sheet, nameAddr);
  const rank = readCellText(sheet, rankAddr);
  if (!name && !rank) return '';
  return [name, rank].filter(Boolean).join(' ');
}

/**
 * 从 WorkSheet 中提取从者 (Servant) 人物卡数据
 *
 * 单元格位置基于 RC1.15从者角色卡.xlsx 模板：
 *   N3 = 职介
 *   C15~I15 = 合计属性（等级/筋力/耐久/敏捷/魔力/幸运/宝具）
 *   C16~I16 + C17~I17 = 基础属性（两行相加）
 *   I16 + V72 = 基础宝具
 *   C18~I18 = 补正属性
 *   C20/C29/C38 = 职介技能名称，F20/F29/F38 = 等级
 *   C48/C57/C66 = 保有技能名称，F48/F57/F66 = 等级
 *   M20/M29/M38 = 宝具名称，P20/P29/P38 = 等级
 */
function parseServantSheet(sheet) {
  // ---- 职介 ----
  const className = readCellText(sheet, 'N3') || '未知';

  // ---- 合计属性 ----
  const totalStats = {
    level: readCellNumber(sheet, 'C15'),
    strength: readCellNumber(sheet, 'D15'),
    endurance: readCellNumber(sheet, 'E15'),
    agility: readCellNumber(sheet, 'F15'),
    mana: readCellNumber(sheet, 'G15'),
    luck: readCellNumber(sheet, 'H15'),
    noblePhantasm: readCellNumber(sheet, 'I15'),
  };

  // ---- 基础属性（第16行 + 第17行） ----
  const baseStats = {
    level: readCellNumber(sheet, 'C16') + readCellNumber(sheet, 'C17'),
    strength: readCellNumber(sheet, 'D16') + readCellNumber(sheet, 'D17'),
    endurance: readCellNumber(sheet, 'E16') + readCellNumber(sheet, 'E17'),
    agility: readCellNumber(sheet, 'F16') + readCellNumber(sheet, 'F17'),
    mana: readCellNumber(sheet, 'G16') + readCellNumber(sheet, 'G17'),
    luck: readCellNumber(sheet, 'H16') + readCellNumber(sheet, 'H17'),
    // 基础宝具 = I16 + V72（特殊位置）
    noblePhantasm: readCellNumber(sheet, 'I16') + readCellNumber(sheet, 'V72'),
  };

  // ---- 补正属性 ----
  const correctionStats = {
    level: readCellNumber(sheet, 'C18'),
    strength: readCellNumber(sheet, 'D18'),
    endurance: readCellNumber(sheet, 'E18'),
    agility: readCellNumber(sheet, 'F18'),
    mana: readCellNumber(sheet, 'G18'),
    luck: readCellNumber(sheet, 'H18'),
    noblePhantasm: readCellNumber(sheet, 'I18'),
  };

  // ---- 职介技能 ----
  const classSkills = [];
  for (let i = 0; i < 3; i++) {
    const row = 20 + i * 9; // 20, 29, 38
    const name = joinCellText(sheet, `C${row}`, `F${row}`);
    if (name) classSkills.push({ name, rank: '', desc: '' });
  }

  // ---- 保有技能 ----
  const personalSkills = [];
  for (let i = 0; i < 3; i++) {
    const row = 48 + i * 9; // 48, 57, 66
    const name = joinCellText(sheet, `C${row}`, `F${row}`);
    if (name) personalSkills.push({ name, rank: '', desc: '' });
  }

  // ---- 宝具 ----
  const noblePhantasms = [];
  for (let i = 0; i < 3; i++) {
    const row = 20 + i * 9; // 20, 29, 38
    const name = joinCellText(sheet, `M${row}`, `P${row}`);
    if (name) noblePhantasms.push({ name, rank: '', desc: '' });
  }

  return {
    className,
    cardType: 'SERVANT',
    totalStats,
    baseStats,
    correctionStats,
    classSkills,
    personalSkills,
    noblePhantasms,
    workshops: null,
    craftEssences: null,
    // 规则书RC1.15核心字段（L列标签 → M列数据）
    hiddenAttribute: readCellText(sheet, 'M8') || null,  // L8="隐属"
    traits: readCellList(sheet, 'M6'),                    // L6="特性"
    specialAttack: readCellText(sheet, 'M2') || null,     // L2="特攻列表"
  };
}

/**
 * 从 WorkSheet 中提取御主 (Master) 角色卡数据
 *
 * 单元格位置基于 RC1.15御主角色卡.xlsx 模板：
 *   C16 = 等级
 *   D16~I16 = 合计属性（筋力/耐久/敏捷/魔力/幸运/回路）
 *   C26/C33/C40 = 工坊名称
 *   C48/C57/C66 = 保有技能名称，F48/F57/F66 = 等级
 *   M48/M57/M66 = 礼装名称
 */
function parseMasterSheet(sheet) {
  // ---- 合计属性（御主使用不同的列名映射） ----
  const totalStats = {
    level: readCellNumber(sheet, 'C16'),
    strength: readCellNumber(sheet, 'D16'),
    endurance: readCellNumber(sheet, 'E16'),
    agility: readCellNumber(sheet, 'F16'),
    mana: readCellNumber(sheet, 'G16'),
    luck: readCellNumber(sheet, 'H16'),
    // 御主的第7项属性是"回路"而非"宝具"
    noblePhantasm: readCellNumber(sheet, 'I16'),
  };

  // 御主固定职介
  const className = '御主';

  // ---- 工坊 ----
  const workshops = [];
  for (let i = 0; i < 3; i++) {
    const row = 26 + i * 7; // 26, 33, 40
    const name = readCellText(sheet, `C${row}`);
    if (name) workshops.push({ name, rank: '', desc: '' });
  }

  // ---- 保有技能 ----
  const personalSkills = [];
  for (let i = 0; i < 3; i++) {
    const row = 48 + i * 9; // 48, 57, 66
    const name = joinCellText(sheet, `C${row}`, `F${row}`);
    if (name) personalSkills.push({ name, rank: '', desc: '' });
  }

  // ---- 礼装 ----
  const craftEssences = [];
  for (let i = 0; i < 3; i++) {
    const row = 48 + i * 9; // 48, 57, 66
    const name = readCellText(sheet, `M${row}`);
    if (name) craftEssences.push({ name, rank: '', desc: '' });
  }

  return {
    className,
    cardType: 'MASTER',
    totalStats,
    baseStats: totalStats,
    correctionStats: { level: 0, strength: 0, endurance: 0, agility: 0, mana: 0, luck: 0, noblePhantasm: 0 },
    classSkills: [],
    personalSkills,
    noblePhantasms: [],
    workshops,
    craftEssences,
    // 规则书RC1.15核心字段（L列标签 → M列数据，御主模板无隐属）
    hiddenAttribute: null,
    traits: readCellList(sheet, 'M6'),                    // L6="特性"
    specialAttack: readCellText(sheet, 'M2') || null,     // L2="特攻列表"
  };
}

/** 标准从者职介名称（中英文） */
const SERVANT_CLASSES = new Set([
  '剑', '弓', '枪', '骑', '术', '杀', '狂',
  'Saber', 'Archer', 'Lancer', 'Rider', 'Caster', 'Assassin', 'Berserker',
  'saber', 'archer', 'lancer', 'rider', 'caster', 'assassin', 'berserker',
]);

/**
 * 自动检测卡片类型
 *
 * RC1.15 从者模板：N3 = 职介名（如 "Rider"）
 * RC1.15 御主模板：N3 = 职业名（如 "魔术师"），而且合计属性在 C16 行而非 C15
 *
 * 检测策略：
 *   1. N3 的值是不是标准从者职介 → SERVANT
 *   2. C15 行是否有数值（从者合计行）vs C16 行（御主合计行）
 *   3. 检查是否有 "回路" 标签（御主特征）
 */
function detectCardType(sheet) {
  const n3 = readCellText(sheet, 'N3');

  // 1. N3 是标准从者职介名 → 从者
  if (n3 && SERVANT_CLASSES.has(n3)) {
    return 'SERVANT';
  }

  // 2. 从者合计在 C15，御主合计在 C16
  //    检查哪个单元格有数值来判断卡片类型
  const servantTotal = readCellNumber(sheet, 'C15');
  const masterTotal = readCellNumber(sheet, 'C16');

  // 2a. 从者卡特征：C15 有数值（合计等级）
  if (servantTotal > 0 && masterTotal === 0) {
    return 'SERVANT';
  }

  // 2b. 御主卡特征：C16 有数值但 C15 没有
  if (masterTotal > 0 && servantTotal === 0) {
    return 'MASTER';
  }

  // 3. 检查 I15（从者：宝具）vs I15（御主：回路在I15，但在从者模板中I14位置）
  //    读取 I14 标签：从者=宝具 / I15标签：御主=回路
  //    实际上在从者卡第14行是表头，I14='宝具'；御主卡中I15='回路'
  const servantLabel14 = readCellText(sheet, 'I14');
  const masterLabel15 = readCellText(sheet, 'I15');

  if (servantLabel14 === '宝具') {
    return 'SERVANT';
  }
  if (masterLabel15 === '回路') {
    return 'MASTER';
  }

  // 4. 目主特征：B16 是否为 "合计"（在从者模板中B15才是合计）
  const b15Label = readCellText(sheet, 'B15');
  const b16Label = readCellText(sheet, 'B16');
  if (b16Label === '合计' && b15Label !== '合计') {
    return 'MASTER';
  }

  // 5. 无法确定，默认从者
  return 'SERVANT';
}

/**
 * 解析上传的 Excel 角色卡文件
 *
 * @param {File} file - 用户上传的 .xlsx 文件
 * @param {string} [cardType] - 可选，强制指定卡片类型 'SERVANT' 或 'MASTER'，不指定则自动检测
 * @returns {Promise<Object>} 解析结果，格式与 useCharacterCardParser.parse() 一致，
 *   包含 code（空字符串，需要用户填写）、className、cardType、totalStats、
 *   baseStats、correctionStats、classSkills、personalSkills、noblePhantasms、
 *   workshops、craftEssences 等字段
 */
/**
 * 在 workbook 中寻找角色卡数据所在的工作表
 *
 * RC1.15 模板的结构是：
 *   Sheet 1 = "说明"（版本日志，无数据）
 *   Sheet 2 = "角色卡"（实际角色数据）
 * 优先匹配名称含"角色卡"的，否则选第二个工作表，
 * 因为第一个几乎总是说明页
 */
function findCardSheet(workbook) {
  const names = workbook.SheetNames;
  if (!names || names.length === 0) return null;

  // 1. 优先匹配名称含"角色卡"的
  for (const name of names) {
    if (name.includes('角色卡') || name.includes('角色')) {
      return workbook.Sheets[name];
    }
  }

  // 2. 如果只有一个 sheet，用它
  if (names.length === 1) {
    return workbook.Sheets[names[0]];
  }

  // 3. 多个 sheet 时，试第二个（第一个通常是说明页）
  //    验证第二个 sheet 是否有数据
  for (let i = 1; i < names.length; i++) {
    const sheet = workbook.Sheets[names[i]];
    // 用 C15 或 C16 是否有数值来验证是不是数据页
    const c15 = sheet['C15'];
    const c16 = sheet['C16'];
    if ((c15 && c15.v !== undefined && c15.v !== '') ||
        (c16 && c16.v !== undefined && c16.v !== '')) {
      return sheet;
    }
  }

  // 4. 回退：尝试所有 sheet
  for (let i = 0; i < names.length; i++) {
    const sheet = workbook.Sheets[names[i]];
    const c15 = sheet['C15'];
    const c16 = sheet['C16'];
    if ((c15 && c15.v !== undefined && c15.v !== '') ||
        (c16 && c16.v !== undefined && c16.v !== '')) {
      return sheet;
    }
  }

  // 5. 最后回退到第二个（因为有第一个是说明页的规律）
  if (names.length >= 2) {
    return workbook.Sheets[names[1]];
  }
  return workbook.Sheets[names[0]];
}

export function useExcelParser() {
  async function parseExcelFile(file, cardType) {
    if (!file) {
      throw new Error('请选择一个 Excel 文件');
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      throw new Error('仅支持 .xlsx 或 .xls 格式的 Excel 文件');
    }

    // 读取文件为 ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // 用 XLSX 库解析，保留公式信息以获取缓存值
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('Excel 文件中没有找到工作表');
    }

    // 找到角色卡数据所在的工作表（不是说明页）
    const sheet = findCardSheet(workbook);

    if (!sheet) {
      throw new Error('未能找到角色卡数据工作表，请确认使用的是 RC1.15 模板');
    }

    // 确定卡片类型
    const detectedType = cardType || detectCardType(sheet);

    // 按类型解析
    let result;
    if (detectedType === 'MASTER') {
      result = parseMasterSheet(sheet);
    } else {
      result = parseServantSheet(sheet);
    }

    // 补充通用字段：code 留空让用户填写，rawText 记录文件名
    return {
      ...result,
      code: '',
      rawText: `[Excel上传] ${file.name}`,
    };
  }

  return { parseExcelFile };
}
