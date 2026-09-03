// 新三杯角色卡导入脚本：解析 X:\新三杯 的 xlsx 卡，POST 到后端 /api/character-cards
// 用法: node scripts/import-xinsanbei.js
const { createRequire } = require('module');
const requireFromFrontend = createRequire(require('path').join(__dirname, '..', '..', 'frontend', 'package.json'));
const XLSX = requireFromFrontend('xlsx');
const fs = require('fs');
const path = require('path');

const CARDS_DIR = 'X:/新三杯';
const API = 'http://localhost:8100/api/character-cards';
const CAMPAIGN_ID = 999002; // 新三测试

// ---------- 读取工具 ----------
function readNum(sheet, addr) {
  const cell = sheet[addr];
  if (!cell) return 0;
  const v = cell.v !== undefined ? cell.v : cell.w;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}
function readText(sheet, addr) {
  const cell = sheet[addr];
  if (!cell) return '';
  const v = cell.v !== undefined ? cell.v : (cell.w || '');
  return String(v).trim();
}

// 通用：按行列号读取文本
function cellText(sheet, colIdx, rowIdx) {
  const addr = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
  return readText(sheet, addr);
}

// 从者卡解析（基于新三杯模板，行号统一用 0-based，如 row14 = Excel 第15行）
function parseServant(sheet) {
  // N3 = 职介（row2, col13）
  const className = cellText(sheet, 13, 2) || '未知';
  // 合计属性 row14: C~I = 等级/筋力/耐久/敏捷/魔力/幸运/宝具
  const totalStats = {
    level: cellText(sheet, 2, 14) ? Number(cellText(sheet, 2, 14)) : 0,
    strength: Number(cellText(sheet, 3, 14) || 0),
    endurance: Number(cellText(sheet, 4, 14) || 0),
    agility: Number(cellText(sheet, 5, 14) || 0),
    mana: Number(cellText(sheet, 6, 14) || 0),
    luck: Number(cellText(sheet, 7, 14) || 0),
    noblePhantasm: Number(cellText(sheet, 8, 14) || 0),
  };
  // 基础属性 row15(职阶) + row16(分配)
  const baseStats = {
    level: Number(cellText(sheet, 2, 15) || 0) + Number(cellText(sheet, 2, 16) || 0),
    strength: Number(cellText(sheet, 3, 15) || 0) + Number(cellText(sheet, 3, 16) || 0),
    endurance: Number(cellText(sheet, 4, 15) || 0) + Number(cellText(sheet, 4, 16) || 0),
    agility: Number(cellText(sheet, 5, 15) || 0) + Number(cellText(sheet, 5, 16) || 0),
    mana: Number(cellText(sheet, 6, 15) || 0) + Number(cellText(sheet, 6, 16) || 0),
    luck: Number(cellText(sheet, 7, 15) || 0) + Number(cellText(sheet, 7, 16) || 0),
    noblePhantasm: Number(cellText(sheet, 8, 15) || 0) + Number(cellText(sheet, 8, 16) || 0),
  };
  // 补正 row17
  const correctionStats = {
    level: Number(cellText(sheet, 2, 17) || 0),
    strength: Number(cellText(sheet, 3, 17) || 0),
    endurance: Number(cellText(sheet, 4, 17) || 0),
    agility: Number(cellText(sheet, 5, 17) || 0),
    mana: Number(cellText(sheet, 6, 17) || 0),
    luck: Number(cellText(sheet, 7, 17) || 0),
    noblePhantasm: Number(cellText(sheet, 8, 17) || 0),
  };

  // 职阶技能：模板行 19/28/37，名称列 C(row,2)，等级列 F(row,5)
  const classSkills = [];
  for (const base of [19, 28, 37]) {
    const name = cellText(sheet, 2, base);
    if (!name) continue;
    const rank = cellText(sheet, 5, base);
    // 效果从 row base+3 开始（效果标题在 base+3）
    const effectLines = [];
    for (let i = 3; i <= 5; i++) {
      const t = cellText(sheet, 2, base + i);
      if (t) effectLines.push(t);
    }
    classSkills.push({ name, rank, effect: effectLines.join(' '), timing: cellText(sheet, 5, base + 2) });
  }

  // 宝具：模板行 19/28/37，名称列 M(row,12)，等级列 P(row,15)
  const noblePhantasms = [];
  for (const base of [19, 28, 37]) {
    const name = cellText(sheet, 12, base);
    if (!name) continue;
    const rank = cellText(sheet, 15, base);
    const effectLines = [];
    for (let i = 3; i <= 5; i++) {
      const t = cellText(sheet, 12, base + i);
      if (t) effectLines.push(t);
    }
    noblePhantasms.push({ name, rank, effect: effectLines.join(' '), timing: cellText(sheet, 15, base + 2), type: cellText(sheet, 15, base + 1) });
  }

  // 保有技能：模板行 47/56/65，名称列 C(row,2)，等级列 F(row,5)
  const personalSkills = [];
  for (const base of [47, 56, 65]) {
    const name = cellText(sheet, 2, base);
    if (!name) continue;
    const rank = cellText(sheet, 5, base);
    const effectLines = [];
    for (let i = 3; i <= 5; i++) {
      const t = cellText(sheet, 2, base + i);
      if (t) effectLines.push(t);
    }
    personalSkills.push({ name, rank, effect: effectLines.join(' '), timing: cellText(sheet, 5, base + 2) });
  }

  // 代号 = 文件名（去掉扩展名和职介前缀）
  return {
    className, totalStats, baseStats, correctionStats,
    classSkills, personalSkills, noblePhantasms,
  };
}

// 御主卡解析（行号 0-based）
function parseMaster(sheet) {
  // N3 = 职业（row2, col13）
  const className = cellText(sheet, 13, 2) || '未知';
  // 合计属性 row15: C~I = 等级/筋力/耐久/敏捷/魔力/幸运/回路
  const totalStats = {
    level: Number(cellText(sheet, 2, 15) || 0),
    strength: Number(cellText(sheet, 3, 15) || 0),
    endurance: Number(cellText(sheet, 4, 15) || 0),
    agility: Number(cellText(sheet, 5, 15) || 0),
    mana: Number(cellText(sheet, 6, 15) || 0),
    luck: Number(cellText(sheet, 7, 15) || 0),
    noblePhantasm: Number(cellText(sheet, 8, 15) || 0),
  };
  const baseStats = {
    level: Number(cellText(sheet, 2, 16) || 0) + Number(cellText(sheet, 2, 17) || 0),
    strength: Number(cellText(sheet, 3, 16) || 0) + Number(cellText(sheet, 3, 17) || 0),
    endurance: Number(cellText(sheet, 4, 16) || 0) + Number(cellText(sheet, 4, 17) || 0),
    agility: Number(cellText(sheet, 5, 16) || 0) + Number(cellText(sheet, 5, 17) || 0),
    mana: Number(cellText(sheet, 6, 16) || 0) + Number(cellText(sheet, 6, 17) || 0),
    luck: Number(cellText(sheet, 7, 16) || 0) + Number(cellText(sheet, 7, 17) || 0),
    noblePhantasm: Number(cellText(sheet, 8, 16) || 0) + Number(cellText(sheet, 8, 17) || 0),
  };
  const correctionStats = {
    level: Number(cellText(sheet, 2, 18) || 0),
    strength: Number(cellText(sheet, 3, 18) || 0),
    endurance: Number(cellText(sheet, 4, 18) || 0),
    agility: Number(cellText(sheet, 5, 18) || 0),
    mana: Number(cellText(sheet, 6, 18) || 0),
    luck: Number(cellText(sheet, 7, 18) || 0),
    noblePhantasm: Number(cellText(sheet, 8, 18) || 0),
  };

  // 保有技能 row47/56/65
  const personalSkills = [];
  for (const base of [47, 56, 65]) {
    const name = cellText(sheet, 2, base);
    if (!name) continue;
    const rank = cellText(sheet, 5, base);
    const effectLines = [];
    for (let i = 3; i <= 5; i++) {
      const t = cellText(sheet, 2, base + i);
      if (t) effectLines.push(t);
    }
    personalSkills.push({ name, rank, effect: effectLines.join(' '), timing: cellText(sheet, 5, base + 2) });
  }

  // 工房/礼装：模板行 19 附近（工房构件）
  const workshops = [];
  for (const base of [19, 32, 39]) {
    const name = cellText(sheet, 2, base);
    if (name && (name.includes('模板') || name.includes('构件'))) continue;
    if (name) {
      workshops.push({ name, detail: cellText(sheet, 2, base + 1) || '' });
    }
  }

  return {
    className, totalStats, baseStats, correctionStats,
    personalSkills, workshops,
  };
}

// ---------- 主流程 ----------
async function main() {
  const servantsDir = path.join(CARDS_DIR, '从者');
  const mastersDir = path.join(CARDS_DIR, '御主');
  const results = { ok: 0, fail: 0 };

  async function importCard(filePath, cardType) {
    try {
      const wb = XLSX.readFile(filePath);
      // 找"角色卡"sheet（从者和御主的 sheet 名略有差异：'角色卡 ' / '角色卡'）
      const sheetName = wb.SheetNames.find(n => n.includes('角色卡'));
      if (!sheetName) {
        console.log('  [跳过] 无角色卡 sheet:', filePath);
        results.fail++;
        return;
      }
      const sheet = wb.Sheets[sheetName];
      const parsed = cardType === 'SERVANT' ? parseServant(sheet) : parseMaster(sheet);
      const fname = path.basename(filePath).replace(/\.xlsx?$/i, '');
      // 代号：去掉职介前缀（如 "Archer 司马师" → "司马师"）
      const code = fname.replace(/^(Archer|Assassin|Berserker|Caster|Lancer|Rider|Saber|剑|枪|弓|骑|杀|术|狂)\s*/i, '');

      const payload = {
        code, className: parsed.className, cardType, campaignId: CAMPAIGN_ID,
        totalStats: parsed.totalStats,
        baseStats: parsed.baseStats,
        correctionStats: parsed.correctionStats,
        classSkills: parsed.classSkills || [],
        personalSkills: parsed.personalSkills || [],
        noblePhantasms: parsed.noblePhantasms || [],
        workshops: parsed.workshops || [],
        craftEssences: [],
      };

      const resp = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
      }
      const data = await resp.json();
      console.log(`  [OK] ${data.className || parsed.className} (${code}) → id=${data.id}`);
      results.ok++;
    } catch (e) {
      console.log(`  [失败] ${path.basename(filePath)}: ${e.message}`);
      results.fail++;
    }
  }

  console.log('=== 从者 ===');
  for (const f of fs.readdirSync(servantsDir).filter(f => f.endsWith('.xlsx'))) {
    await importCard(path.join(servantsDir, f), 'SERVANT');
  }
  console.log('=== 御主 ===');
  for (const f of fs.readdirSync(mastersDir).filter(f => f.endsWith('.xlsx'))) {
    await importCard(path.join(mastersDir, f), 'MASTER');
  }

  console.log(`\n=== 导入完成: ${results.ok}成功, ${results.fail}失败 ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
