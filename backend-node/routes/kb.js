// 规则知识库：状态 / 检索 / 重建 / AI 判定建议
const express = require('express');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { getDb } = require('../db');

const router = express.Router();

// DeepSeek key 读取：优先环境变量，其次读 data/deepseek.key（该目录已被 .gitignore 忽略，key 不会提交）
function getDeepSeekKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  try {
    const f = path.join(__dirname, '..', 'data', 'deepseek.key');
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf-8').trim();
  } catch (e) {
    /* 忽略读取失败 */
  }
  return null;
}

// 把用户问题拆成检索术语：中文连续串（≤6 字整体，长句滑窗拆 2-4 字）+ 英文/数字词
function extractTerms(input) {
  const terms = new Set();
  for (const m of input.matchAll(/[a-zA-Z0-9]{2,}/g)) {
    terms.add(m[0]);
  }
  for (const m of input.matchAll(/[一-鿿]+/g)) {
    const s = m[0];
    if (s.length <= 6) {
      // 短词：整体 + 2 字窗口（拆开"令咒撤退"这类组合词，提高召回）
      terms.add(s);
      if (s.length > 2) {
        for (let i = 0; i + 2 <= s.length; i++) terms.add(s.slice(i, i + 2));
      }
    } else {
      // 长句：2-4 字滑窗
      for (let n = 2; n <= 4; n++) {
        for (let i = 0; i + n <= s.length; i++) {
          terms.add(s.slice(i, i + n));
        }
      }
    }
  }
  return [...terms];
}

// 关键词检索：LIKE 子串匹配 + 评分（标题命中权重高，内容命中记分），全量扫描（几百块，毫秒级）
function searchChunks(q, topK = 6) {
  const terms = extractTerms(q);
  if (!terms.length) return [];
  const rows = getDb()
    .prepare('SELECT source_file, title, content FROM kb_chunk')
    .all();
  const scored = [];
  for (const r of rows) {
    let score = 0;
    for (const t of terms) {
      if (r.title.includes(t)) score += 3;
      if (r.content.includes(t)) score += 1;
    }
    if (score > 0) {
      scored.push({ source_file: r.source_file, title: r.title, content: r.content, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

// GET /api/kb/status：索引是否已构建
router.get('/status', (req, res) => {
  try {
    const { c } = getDb().prepare('SELECT COUNT(*) AS c FROM kb_chunk').get();
    res.json({ built: c > 0, chunkCount: c });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/kb/rebuild：全量重建索引（复用 build-kb.js）
router.post('/rebuild', (req, res) => {
  const script = path.join(__dirname, '..', 'scripts', 'build-kb.js');
  res.status(202).json({ message: '重建已开始，完成后可刷新 status 查看结果' });
  execFile(process.execPath, [script], { cwd: path.join(__dirname, '..') }, (err, stdout, stderr) => {
    if (err) {
      console.error('[kb rebuild] 失败:', stderr || err.message);
      return;
    }
    console.log('[kb rebuild] 完成');
  });
});

// GET /api/kb/search?q=...&topK=6：关键词检索，返回相关规则块
router.get('/search', (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: '缺少查询词 q' });
    const topK = Math.min(parseInt(req.query.topK, 10) || 6, 20);
    const results = searchChunks(q, topK);
    res.json({ query: q, results });
  } catch (e) {
    next(e);
  }
});

// POST /api/kb/advise {question, topK}：检索 + DeepSeek 判定建议
// 无 key 或调用失败时降级：返回检索原文，llmSkipped=true
router.post('/advise', async (req, res, next) => {
  try {
    const question = String(req.body.question || '').trim();
    if (!question) return res.status(400).json({ error: '缺少问题 question' });
    if (question.length > 2000) return res.status(400).json({ error: '问题过长，最多 2000 字' });
    const topK = Math.min(parseInt(req.body.topK, 10) || 6, 20);

    const sources = searchChunks(question, topK);
    const apiKey = getDeepSeekKey();
    if (!apiKey) {
      return res.json({ answer: null, llmSkipped: true, error: '未配置 DEEPSEEK_API_KEY', sources });
    }

    // 拼规则上下文，每条截断到 800 字防超 token
    const context = sources
      .map((s, i) => `【来源${i + 1}】${s.source_file} | ${s.title}\n${s.content.slice(0, 800)}`)
      .join('\n\n');

    const system = [
      '你是空想圣杯 TRPG 的 GM 规则判定助手。',
      '你会收到检索到的规则原文片段和 GM 的判定问题。',
      '请基于规则原文给出判定建议：先给出结论，再引用对应规则依据。',
      '要求：只给建议供 GM 审核，绝不擅自替 GM 做最终裁决或修改任何数据。',
      '若规则原文不足以支撑判定，明确说明不确定之处，并指出需要 GM 自行裁决的部分。',
    ].join('\n');

    const payload = {
      model: 'deepseek-chat',
      temperature: 0.3,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `【规则片段】\n${context}\n\n【判定问题】\n${question}` },
      ],
    };

    let data;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60000);
      const resp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
      });
      clearTimeout(timer);
      if (!resp.ok) {
        const errText = await resp.text();
        return res.json({ answer: null, llmSkipped: true, error: `DeepSeek ${resp.status}: ${errText.slice(0, 200)}`, sources });
      }
      data = await resp.json();
    } catch (e) {
      return res.json({ answer: null, llmSkipped: true, error: `LLM 调用失败: ${e.message}`, sources });
    }

    const answer = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : null;
    res.json({ answer, llmSkipped: !answer, sources });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
