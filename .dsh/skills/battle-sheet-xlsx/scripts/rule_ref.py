#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本地规则/资源库查证工具（避免 AI 判例幻觉）

把 knowledge/*.md 与根目录 判例.md 按 Markdown 标题切块，按查询词打分，
返回最相关的几个片段（含出处：文件 > 标题路径），方便判定时引用规则原文。

用法：
  python rule_ref.py --q "宝具 发动时机"
  python rule_ref.py --q "魔力不足" --top 3 --max-chars 800
  python rule_ref.py --q "英雄的伴娘" --file 从者扩充包.md   # 限定单个库
"""

import argparse
import glob
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# 项目根 = 向上找 knowledge 目录
def _find_project_root():
    d = os.path.dirname(os.path.abspath(__file__))
    for _ in range(8):
        if os.path.isdir(os.path.join(d, 'knowledge')):
            return d
        p = os.path.dirname(d)
        if p == d:
            break
        d = p
    return os.getcwd()

PROJECT_ROOT = _find_project_root()
KNOWLEDGE_DIR = os.path.join(PROJECT_ROOT, 'knowledge')
PRECEDENT_FILE = os.path.join(PROJECT_ROOT, '判例.md')


def load_chunks(only_file=None):
    files = sorted(glob.glob(os.path.join(KNOWLEDGE_DIR, '*.md')))
    if os.path.exists(PRECEDENT_FILE):
        files.append(PRECEDENT_FILE)
    chunks = []
    for path in files:
        base = os.path.basename(path)
        if only_file and only_file not in base:
            continue
        try:
            text = open(path, encoding='utf-8').read()
        except Exception as e:
            print(f'[warn] 读取失败 {path}: {e}', file=sys.stderr)
            continue
        stack = []
        cur = {'file': base, 'headings': [], 'lines': []}

        def flush():
            if cur['lines'] and any(l.strip() for l in cur['lines']):
                chunks.append({'file': cur['file'], 'headings': list(cur['headings']),
                               'text': '\n'.join(cur['lines']).strip()})

        for line in text.split('\n'):
            m = re.match(r'^(#{1,6})\s+(.*)$', line)
            if m:
                flush()
                lvl = len(m.group(1))
                title = m.group(2).strip()
                while stack and stack[-1][0] >= lvl:
                    stack.pop()
                stack.append((lvl, title))
                cur = {'file': base, 'headings': [t for _, t in stack], 'lines': []}
            else:
                cur['lines'].append(line)
        flush()
    return chunks


def main():
    parser = argparse.ArgumentParser(description='本地规则/资源库查证')
    parser.add_argument('--q', '--query', dest='query', required=True, help='查询词，多个词用空格/、/，分隔')
    parser.add_argument('--top', type=int, default=3, help='返回片段数（默认3）')
    parser.add_argument('--max-chars', type=int, default=700, help='每个片段最多字符数（默认700）')
    parser.add_argument('--file', default=None, help='限定某个库文件（如 从者扩充包.md / 规则书.md / 判例.md）')
    args = parser.parse_args()

    terms = [t for t in re.split(r'[\s、，,;；。?？]+', args.query) if t]
    if not terms:
        print('[错误] 查询词为空', file=sys.stderr)
        return 1

    chunks = load_chunks(args.file)
    scored = []
    for c in chunks:
        body = c['text']
        head = ' > '.join(c['headings'])
        hit = 0
        total = 0
        for t in terms:
            if t in head:
                hit += 1
                total += 10
            cnt = body.count(t)
            if cnt:
                hit += 1
                total += cnt
        if total > 0:
            scored.append((hit, total, c))
    scored.sort(key=lambda x: (-x[0], -x[1]))

    print(f'== 规则查证: {args.query} ==')
    if not scored:
        print('  未在规则/资源库中找到相关内容。请标注「规则库未覆盖」，由 GM 裁决并建议记入判例。')
        return 0
    for i, (hit, total, c) in enumerate(scored[:args.top], 1):
        path = c['file'] + (' > ' + ' > '.join(c['headings']) if c['headings'] else '')
        text = c['text'].replace('\n', ' ')[:args.max_chars]
        print(f'[{i}] {path}')
        print(f'    {text}')
        print()
    print(f'（共命中 {len(scored)} 段，显示前 {min(args.top, len(scored))} 段；需要更完整原文请用 --max-chars 调大）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
