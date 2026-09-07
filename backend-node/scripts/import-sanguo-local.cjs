// 三国杯角色卡本地导入：解析项目内 新三杯子/ 目录的 xlsx，POST 到后端
// 改造自 import-xinsanbei.js：路径改本地 + 按 code 防重复 + 损坏卡兜底
const { createRequire } = require('module');
const requireFromBackend = createRequire(require('path').join(__dirname, '..', 'package.json'));
const XLSX = requireFromBackend('xlsx');
const fs = require('fs');
const path = require('path');

const CARDS_DIR = path.join(__dirname, '..', '..', '新三杯子');
const API = 'http://localhost:8100/api/character-cards';
const CAMPAIGN_ID = 999002;

// ---------- 读取工具（与原脚本一致） ----------
function readText(sheet, addr) {
  const cell = sheet[addr];
  if (!cell) return '';
  return String(cell.v !== undefined ? cell.v : (cell.w || '')).trim();
}
function cellText(sheet, colIdx, rowIdx) {
  return readText(sheet, XLSX.utils.encode_cell({ r: rowIdx, c: colIdx }));
}

// ---------- 解析（与原脚本一致的 RC1.15 模板坐标） ----------
function parseServant(sheet) {
  const className = cellText(sheet, 13, 2) || '未知';
  const totalStats = {
    level: Number(cellText(sheet, 2, 14) || 0), strength: Number(cellText(sheet, 3, 14) || 0),
    endurance: Number(cellText(sheet, 4, 14) || 0), agility: Number(cellText(sheet, 5, 14) || 0),
    mana: Number(cellText(sheet, 6, 14) || 0), luck: Number(cellText(sheet, 7, 14) || 0),
    noblePhantasm: Number(cellText(sheet, 8, 14) || 0),
  };
  const sumRows = (rowA, rowB) => ({
    level: Number(cellText(sheet, 2, rowA) || 0) + Number(cellText(sheet, 2, rowB) || 0),
    strength: Number(cellText(sheet, 3, rowA) || 0) + Number(cellText(sheet, 3, rowB) || 0),
    endurance: Number(cellText(sheet, 4, rowA) || 0) + Number(cellText(sheet, 4, rowB) || 0),
    agility: Number(cellText(sheet, 5, rowA) || 0) + Number(cellText(sheet, 5, rowB) || 0),
    mana: Number(cellText(sheet, 6, rowA) || 0) + Number(cellText(sheet, 6, rowB) || 0),
    luck: Number(cellText(sheet, 7, rowA) || 0) + Number(cellText(sheet, 7, rowB) || 0),
    noblePhantasm: Number(cellText(sheet, 8, rowA) || 0) + Number(cellText(sheet, 8, rowB) || 0),
  });
  const baseStats = sumRows(15, 16);
  const correctionStats = {
    level: Number(cellText(sheet, 2, 17) || 0), strength: Number(cellText(sheet, 3, 17) || 0),
    endurance: Number(cellText(sheet, 4, 17) || 0), agility: Number(cellText(sheet, 5, 17) || 0),
    mana: Number(cellText(sheet, 6, 17) || 0), luck: Number(cellText(sheet, 7, 17) || 0),
    noblePhantasm: Number(cellText(sheet, 8, 17) || 0),
  };
  const classSkills = [], noblePhantasms = [], personalSkills = [];
  for (const base of [19, 28, 37]) {
    const name = cellText(sheet, 2, base);
    if (name) classSkills.push({ name, rank: cellText(sheet, 5, base), effect: [3, 4, 5].map(i => cellText(sheet, 2, base + i)).filter(Boolean).join(' '), timing: cellText(sheet, 5, base + 2) });
    const npName = cellText(sheet, 12, base);
    if (npName) noblePhantasms.push({ name: npName, rank: cellText(sheet, 15, base), effect: [3, 4, 5].map(i => cellText(sheet, 12, base + i)).filter(Boolean).join(' '), timing: cellText(sheet, 15, base + 2), type: cellText(sheet, 15, base + 1) });
  }
  for (const base of [47, 56, 65]) {
    const name = cellText(sheet, 2, base);
    if (name) personalSkills.push({ name, rank: cellText(sheet, 5, base), effect: [3, 4, 5].map(i => cellText(sheet, 2, base + i)).filter(Boolean).join(' '), timing: cellText(sheet, 5, base + 2) });
  }
  return { className, totalStats, baseStats, correctionStats, classSkills, personalSkills, noblePhantasms };
}

function parseMaster(sheet) {
  const className = cellText(sheet, 13, 2) || '未知';
  const totalStats = {
    level: Number(cellText(sheet, 2, 15) || 0), strength: Number(cellText(sheet, 3, 15) || 0),
    endurance: Number(cellText(sheet, 4, 15) || 0), agility: Number(cellText(sheet, 5, 15) || 0),
    mana: Number(cellText(sheet, 6, 15) || 0), luck: Number(cellText(sheet, 7, 15) || 0),
    noblePhantasm: Number(cellText(sheet, 8, 15) || 0),
  };
  const sumRows = (rowA, rowB) => ({
    level: Number(cellText(sheet, 2, rowA) || 0) + Number(cellText(sheet, 2, rowB) || 0),
    strength: Number(cellText(sheet, 3, rowA) || 0) + Number(cellText(sheet, 3, rowB) || 0),
    endurance: Number(cellText(sheet, 4, rowA) || 0) + Number(cellText(sheet, 4, rowB) || 0),
    agility: Number(cellText(sheet, 5, rowA) || 0) + Number(cellText(sheet, 5, rowB) || 0),
    mana: Number(cellText(sheet, 6, rowA) || 0) + Number(cellText(sheet, 6, rowB) || 0),
    luck: Number(cellText(sheet, 7, rowA) || 0) + Number(cellText(sheet, 7, rowB) || 0),
    noblePhantasm: Number(cellText(sheet, 8, rowA) || 0) + Number(cellText(sheet, 8, rowB) || 0),
  });
  const baseStats = sumRows(16, 17);
  const correctionStats = {
    level: Number(cellText(sheet, 2, 18) || 0), strength: Number(cellText(sheet, 3, 18) || 0),
    endurance: Number(cellText(sheet, 4, 18) || 0), agility: Number(cellText(sheet, 5, 18) || 0),
    mana: Number(cellText(sheet, 6, 18) || 0), luck: Number(cellText(sheet, 7, 18) || 0),
    noblePhantasm: Number(cellText(sheet, 8, 18) || 0),
  };
  const personalSkills = [], workshops = [];
  for (const base of [47, 56, 65]) {
    const name = cellText(sheet, 2, base);
    if (name) personalSkills.push({ name, rank: cellText(sheet, 5, base), effect: [3, 4, 5].map(i => cellText(sheet, 2, base + i)).filter(Boolean).join(' '), timing: cellText(sheet, 5, base + 2) });
  }
  for (const base of [19, 32, 39]) {
    const name = cellText(sheet, 2, base);
    if (name && !name.includes('模板') && !name.includes('构件')) workshops.push({ name, detail: cellText(sheet, 2, base + 1) || '' });
  }
  return { className, totalStats, baseStats, correctionStats, personalSkills, workshops };
}

// ---------- 主流程 ----------
async function main() {
  const results = { ok: 0, skip: 0, fail: 0 };
  const failed = [];

  // 已有卡（防重复）：code 相同即跳过
  const existing = await (await fetch(`${API}?campaignId=${CAMPAIGN_ID}&page=0&size=100`)).json();
  const existingCodes = new Set((existing.content ?? []).map(c => c.code));

  async function importCard(filePath, cardType) {
    const fname = path.basename(filePath).replace(/\.xlsx?$/i, '');
    try {
      const wb = XLSX.readFile(filePath);
      const sheetName = wb.SheetNames.find(n => n.includes('角色卡'));
      if (!sheetName) throw new Error('无角色卡 sheet');
      const sheet = wb.Sheets[sheetName];
      const parsed = cardType === 'SERVANT' ? parseServant(sheet) : parseMaster(sheet);
      const code = fname.replace(/^(Archer|Assassin|Berserker|Caster|Lancer|Rider|Saber|剑|枪|弓|骑|杀|术|狂)\s*/i, '');
      if (existingCodes.has(code)) { console.log(`  [跳过] ${code} 已在库`); results.skip++; return; }

      const payload = {
        code, className: parsed.className, cardType, campaignId: CAMPAIGN_ID,
        totalStats: parsed.totalStats, baseStats: parsed.baseStats, correctionStats: parsed.correctionStats,
        classSkills: parsed.classSkills || [], personalSkills: parsed.personalSkills || [],
        noblePhantasms: parsed.noblePhantasms || [], workshops: parsed.workshops || [], craftEssences: [],
      };
      const resp = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 150)}`);
      const data = await resp.json();
      console.log(`  [OK] ${parsed.className} (${code}) → id=${data.id}`);
      results.ok++;
    } catch (e) {
      console.log(`  [失败] ${fname}: ${e.message}`);
      failed.push(fname);
      results.fail++;
    }
  }

  for (const sub of ['从者', '御主']) {
    const dir = path.join(CARDS_DIR, sub);
    if (!fs.existsSync(dir)) { console.log(`[缺目录] ${dir}`); continue; }
    console.log(`=== ${sub} ===`);
    for (const f of fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'))) {
      await importCard(path.join(dir, f), sub === '从者' ? 'SERVANT' : 'MASTER');
    }
  }
  console.log(`\n=== 完成: ${results.ok} 导入, ${results.skip} 跳过, ${results.fail} 失败 ===`);
  if (failed.length) console.log('失败清单:', failed.join(' | '));
}

main().catch(e => { console.error(e); process.exit(1); });
