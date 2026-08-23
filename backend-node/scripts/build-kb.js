// 构建规则知识库关键词索引
// 用法：node scripts/build-kb.js
// 流程：扫 knowledge/*.md → 按标题切块 → 存 kb_chunk 表 + 同步 FTS5 全文索引
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db');

const KNOWLEDGE_DIR = path.join(__dirname, '..', '..', 'knowledge');

// 逐文件按 markdown 标题（# ~ ####）切块
function chunkMarkdown(filePath, fileName) {
  let raw = fs.readFileSync(filePath, 'utf-8');
  raw = raw.replace(/\r\n/g, '\n'); // 归一化 CRLF，避免标题匹配失败
  const lines = raw.split('\n');
  const chunks = [];
  let titleStack = []; // 标题栈：['第二章', '第三节', '3.2 干涉']
  let cur = null;

  const flush = () => {
    if (!cur) return;
    const content = cur.body.trim();
    const charCount = content.replace(/\s/g, '').length;
    if (charCount > 0) {
      chunks.push({ ...cur, content, char_count: charCount });
    }
  };

  for (const line of lines) {
    const m = line.match(/^(#{1,4})\s+(.*)$/);
    if (m) {
      flush();
      const level = m[1].length;
      const text = m[2].trim();
      titleStack = titleStack.slice(0, level - 1);
      titleStack[level - 1] = text;
      cur = {
        source_file: fileName,
        title: titleStack.join(' / '),
        heading: text,
        heading_level: level,
        body: '',
      };
    } else if (cur) {
      cur.body += (cur.body ? '\n' : '') + line;
    }
  }
  flush();
  return chunks;
}

async function main() {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    console.error(`未找到 knowledge 目录：${KNOWLEDGE_DIR}`);
    process.exit(1);
  }
  const files = fs.readdirSync(KNOWLEDGE_DIR).filter(f => f.endsWith('.md')).sort();
  if (files.length === 0) {
    console.error('knowledge 目录下没有 .md 文件');
    process.exit(1);
  }

  console.log(`扫描 ${files.length} 个 md 文件...`);
  const allChunks = [];
  for (const f of files) {
    const chunks = chunkMarkdown(path.join(KNOWLEDGE_DIR, f), f);
    console.log(`  ${f}: ${chunks.length} 块`);
    allChunks.push(...chunks);
  }
  console.log(`共 ${allChunks.length} 块，写入索引...`);

  const db = getDb();
  db.prepare('DELETE FROM kb_chunk').run();

  const ins = db.prepare(
    `INSERT INTO kb_chunk (source_file, title, heading, heading_level, content, char_count)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const tx = db.transaction(chunks => {
    for (const c of chunks) {
      ins.run(c.source_file, c.title, c.heading, c.heading_level, c.content, c.char_count);
    }
  });
  tx(allChunks);

  console.log(`完成：${allChunks.length} 块已写入 kb_chunk`);
}

main().catch(e => {
  console.error('构建失败：', e);
  process.exit(1);
});
