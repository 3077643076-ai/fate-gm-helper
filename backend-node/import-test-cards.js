/**
 * 批量导入 test/ 目录下的角色卡到数据库
 * 用法: node import-test-cards.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const API = 'http://localhost:8100';

function post(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API);
    const data = JSON.stringify(body || {});
    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      let result = '';
      res.on('data', (c) => result += c);
      res.on('end', () => {
        try { resolve(JSON.parse(result)); }
        catch { resolve(result); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API);
    http.get(url, (res) => {
      let result = '';
      res.on('data', (c) => result += c);
      res.on('end', () => {
        try { resolve(JSON.parse(result)); }
        catch { resolve(result); }
      });
    }).on('error', reject);
  });
}

/**
 * 简单解析 .st 从者文本
 */
function parseServant(text) {
  const parts = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  function val(key, combine) {
    const idx = parts.indexOf(key);
    if (idx === -1 || idx >= parts.length - 1) return combine ? '' : null;
    if (combine) {
      let v = '';
      for (let i = idx + 1; i < parts.length; i++) {
        const cur = parts[i];
        const next = parts[i + 1];
        if (cur.startsWith('合计') || cur.startsWith('基础') || cur.startsWith('补正') ||
            cur.startsWith('职介技能') || cur.startsWith('保有技能') || cur.startsWith('宝具') ||
            cur.startsWith('职介') || cur.startsWith('代号') || cur.startsWith('等级')) break;
        if (next && (next.startsWith('合计') || next.startsWith('基础') || next.startsWith('补正') ||
            next.startsWith('职介技能') || next.startsWith('保有技能') || next.startsWith('宝具') ||
            next.startsWith('职介') || next.startsWith('代号') || next.startsWith('等级'))) {
          v += cur; break;
        }
        v += cur + ' ';
      }
      return v.trim();
    }
    return parts[idx + 1];
  }

  function stats(prefix) {
    return {
      level: parseInt(val(`${prefix}等级`)) || 0,
      strength: parseInt(val(`${prefix}筋力`)) || 0,
      endurance: parseInt(val(`${prefix}耐久`)) || 0,
      agility: parseInt(val(`${prefix}敏捷`)) || 0,
      mana: parseInt(val(`${prefix}魔力`)) || 0,
      luck: parseInt(val(`${prefix}幸运`)) || 0,
      noblePhantasm: parseInt(val(`${prefix}宝具`)) || 0,
    };
  }

  function skills(key, count) {
    const list = [];
    for (let i = 1; i <= count; i++) {
      const v = val(`${key}${i}`, true);
      if (v) list.push({ name: v, rank: '', desc: '' });
    }
    return list;
  }

  const className = val('职介') || '';
  const code = val('代号') || className || '未知';

  return {
    code, className, rawText: text.trim(), cardType: 'SERVANT',
    totalStats: stats('合计'),
    baseStats: stats('基础'),
    correctionStats: stats('补正'),
    classSkills: skills('职介技能', 3),
    personalSkills: skills('保有技能', 3),
    noblePhantasms: skills('宝具', 3),
    workshops: null,
    craftEssences: null,
  };
}

/**
 * 简单解析 .st 御主文本
 */
function parseMaster(text) {
  const parts = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  function val(key, combine) {
    const idx = parts.indexOf(key);
    if (idx === -1 || idx >= parts.length - 1) return combine ? '' : null;
    if (combine) {
      let v = '';
      for (let i = idx + 1; i < parts.length; i++) {
        const cur = parts[i];
        const next = parts[i + 1];
        if (cur.startsWith('等级') || cur.startsWith('合计') ||
            cur.startsWith('工坊') || cur.startsWith('保有技能') || cur.startsWith('礼装') ||
            cur.startsWith('代号')) break;
        if (next && (next.startsWith('等级') || next.startsWith('合计') ||
            next.startsWith('工坊') || next.startsWith('保有技能') || next.startsWith('礼装') ||
            next.startsWith('代号'))) {
          v += cur; break;
        }
        v += cur + ' ';
      }
      return v.trim();
    }
    return parts[idx + 1];
  }

  const code = val('代号', true) || '未知';
  const totalStats = {
    level: parseInt(val('等级')) || 0,
    strength: parseInt(val('合计筋力')) || 0,
    endurance: parseInt(val('合计耐久')) || 0,
    agility: parseInt(val('合计敏捷')) || 0,
    mana: parseInt(val('合计魔力')) || 0,
    luck: parseInt(val('合计幸运')) || 0,
    noblePhantasm: parseInt(val('合计回路')) || 0,
  };

  function skills(key, count) {
    const list = [];
    for (let i = 1; i <= count; i++) {
      const v = val(`${key}${i}`, true);
      if (v) list.push({ name: v, rank: '', desc: '' });
    }
    return list;
  }

  return {
    code, className: '御主', rawText: text.trim(), cardType: 'MASTER',
    totalStats,
    baseStats: totalStats,
    correctionStats: { level:0, strength:0, endurance:0, agility:0, mana:0, luck:0, noblePhantasm:0 },
    classSkills: [],
    personalSkills: skills('保有技能', 3),
    noblePhantasms: [],
    workshops: skills('工坊', 3),
    craftEssences: skills('礼装', 3),
  };
}

async function main() {
  // 1. 创建测试杯战役
  console.log('创建"测试杯"战役...');
  let campaign;
  try {
    campaign = await post('/api/campaigns', { name: '测试杯', description: '用于测试角色卡导入' });
    console.log('  创建成功, ID:', campaign.id);
  } catch (e) {
    // 可能已存在，获取列表
    const list = await get('/api/campaigns');
    const existing = list.find(c => c.name === '测试杯');
    if (existing) {
      campaign = existing;
      console.log('  已存在, ID:', campaign.id);
    } else {
      console.error('  创建失败:', e.message);
      process.exit(1);
    }
  }

  // 2. 选择测试杯战役
  await post(`/api/campaigns/${campaign.id}/select`);
  console.log('已选择测试杯\n');

  // 3. 读取并导入所有 .st 文件
  const testDir = path.join(__dirname, '..', 'test');
  const dirs = ['从者', '御主'];

  let imported = 0;
  let failed = 0;

  for (const dir of dirs) {
    const dirPath = path.join(testDir, dir);
    if (!fs.existsSync(dirPath)) continue;

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.st'));
    console.log(`--- ${dir} (${files.length}张) ---`);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const text = fs.readFileSync(filePath, 'utf-8').trim();

      if (!text.startsWith('.st')) {
        console.log(`  [跳过] ${file} - 不以.st开头`);
        continue;
      }

      try {
        const isMaster = text.includes('合计回路') || (
          !text.includes('职介') && !text.includes('补正等级')
        );
        const data = isMaster ? parseMaster(text) : parseServant(text);

        data.campaignId = campaign.id;
        // 修复御主卡的 className（文件名中提取）
        if (data.cardType === 'MASTER') {
          // 从文件名提取职介信息 如 "远坂凛_Archer御主.st"
          const m = file.match(/_(Saber|Archer|Lancer|Rider|Caster|Assassin|Berserker)/);
          if (m) data.className = m[1];
        }

        const result = await post('/api/character-cards', data);
        if (result.id) {
          console.log(`  [OK] ${file} → ID:${result.id} [${data.cardType}] ${data.code}`);
          imported++;
        } else {
          console.log(`  [失败] ${file} →`, result.error || result);
          failed++;
        }
      } catch (e) {
        console.log(`  [错误] ${file} →`, e.message);
        failed++;
      }
    }
  }

  console.log(`\n=== 导入完成: ${imported}成功, ${failed}失败 ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
