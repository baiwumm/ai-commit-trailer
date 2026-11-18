#!/usr/bin/env node
// commit-trailer：校验并归一化提交信息里的 AI 署名 trailer。
// 只改 trailer 行，不碰正文，不改写历史。
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = join(SCRIPT_DIR, '..', 'references', 'agents.json');

const KNOWN_KEYS = new Set([
  'co-authored-by', 'assisted-by', 'generated-by', 'signed-off-by', 'reviewed-by',
  'helped-by', 'mentored-by', 'reported-by', 'tested-by', 'acked-by', 'suggested-by',
]);

const TRAILER_LINE = /^([A-Za-z][A-Za-z0-9-]*):[ \t]+(\S.*)$/;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function loadRegistry() {
  const raw = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  return raw.agents.map((agent) => ({
    ...agent,
    aliases: (agent.aliases ?? []).map((a) => a.toLowerCase()),
    regexes: (agent.patterns ?? []).map((p) => new RegExp(p, 'i')),
  }));
}

function splitIdentity(value) {
  const angled = value.match(/^(.*?)\s*<([^<>]*)>\s*$/);
  if (angled) return { name: angled[1].trim(), email: angled[2].trim() };
  return { name: value.trim(), email: '' };
}

function resolveAgent(name, registry) {
  const base = name.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!base) return null;
  // 兼容 `Trae (GLM-4.6)` 这类把模型塞进人名的写法
  const candidates = [...new Set([base, base.replace(/\s*\([^()]*\)\s*$/, '').trim()])];
  return registry.find((agent) => candidates.some((key) =>
    agent.aliases.includes(key) || agent.regexes.some((re) => re.test(key)))) ?? null;
}

function parseMessage(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let end = lines.length - 1;
  while (end >= 0 && lines[end].trim() === '') end -= 1;
  if (end < 0) return { lines, trailer: null, stray: [] };

  let start = end;
  while (start > 0 && lines[start - 1].trim() !== '') start -= 1;

  const block = lines.slice(start, end + 1);
  const isTrailerBlock = block.length > 0 && block.every((line) => TRAILER_LINE.test(line));
  const separated = start === 0 || lines[start - 1].trim() === '';

  if (!isTrailerBlock) return { lines, trailer: null, stray: collectStrayCoAuthors(lines) };

  const parsed = block.map((line) => {
    const m = line.match(TRAILER_LINE);
    return { key: m[1].toLowerCase(), raw: line, value: m[2] };
  });
  return {
    lines,
    trailer: { start, end, entries: parsed, separated },
    stray: collectStrayCoAuthors(lines.slice(0, start)),
  };
}

function collectStrayCoAuthors(lines) {
  const stray = [];
  lines.forEach((line, index) => {
    const m = line.match(TRAILER_LINE);
    if (m && m[1].toLowerCase() === 'co-authored-by') {
      stray.push({ index: index + 1, raw: line, value: m[2] });
    }
  });
  return stray;
}

function checkEntry(entry, registry, seen) {
  const issues = [];
  if (entry.key !== 'co-authored-by') return issues;

  const { name, email } = splitIdentity(entry.value);
  const agent = resolveAgent(name, registry);

  if (!email) {
    issues.push(['error', 'missing-email', `${entry.raw} —— 缺 <email>，GitHub 不解析`]);
  } else if (!EMAIL.test(email)) {
    issues.push(['error', 'invalid-email', `${entry.raw} —— 邮箱不合法`]);
  }

  if (agent) {
    const canonical = `${agent.name} <${agent.email}>`;
    if (email && email.toLowerCase() !== agent.email.toLowerCase()) {
      issues.push(['warn', 'non-canonical-email', `${entry.raw} —— 建议 ${canonical}`]);
    } else if (!email && agent.email) {
      issues.push(['warn', 'non-canonical-name', `${entry.raw} —— 建议 ${canonical}`]);
    }
    if (seen.has(agent.id)) issues.push(['warn', 'duplicate-identity', `${entry.raw} —— 与前面的 ${agent.name} 重复`]);
    seen.add(agent.id);
    if (agent.linked === 'inferred') {
      issues.push(['info', 'unverified-link', `${agent.name} 的邮箱未经实测，可能不计入 Contributors`]);
    }
  } else if (email) {
    issues.push(['warn', 'unknown-agent', `${entry.raw} —— 未在注册表中，无法校验`]);
  } else {
    issues.push(['warn', 'unknown-agent', `${entry.raw} —— 未在注册表中且缺邮箱`]);
  }

  if (/[()]/.test(name)) {
    issues.push(['warn', 'model-in-name', `${entry.raw} —— 模型信息应放 Assisted-by，不要进人名`]);
  }
  return issues;
}

function checkMessage(label, text, registry, strict) {
  const { trailer, stray } = parseMessage(text);
  const issues = [];

  for (const line of stray) {
    issues.push(['error', 'not-in-trailer-block',
      `${label}:${line.index} —— ${line.raw} 不在末尾 trailer 区块内`]);
  }

  if (!trailer) {
    issues.push(['info', 'no-trailer', `${label} —— 没有 trailer 区块（纯人工提交属正常）`]);
  } else {
    if (!trailer.separated) {
      issues.push(['error', 'not-separated', `${label} —— trailer 前缺少空行`]);
    }
    const seen = new Set();
    for (const entry of trailer.entries) {
      for (const issue of checkEntry(entry, registry, seen)) issues.push(issue);
    }
  }

  const errors = issues.filter((i) => i[0] === 'error').length;
  const warns = issues.filter((i) => i[0] === 'warn').length;
  const failed = errors > 0 || (strict && warns > 0);
  return { issues, failed, errors, warns };
}

function fixMessage(text, registry) {
  const { trailer } = parseMessage(text);
  if (!trailer) return { text, notes: ['没有找到 trailer 区块，未改动'] };

  const notes = [];
  const seen = new Set();
  const out = [];
  let dropped = 0;

  for (const entry of trailer.entries) {
    if (entry.key !== 'co-authored-by') {
      out.push(entry.raw);
      continue;
    }
    const { name, email } = splitIdentity(entry.value);
    const agent = resolveAgent(name, registry);
    if (!agent) {
      out.push(entry.raw);
      notes.push(`未识别的 agent，保持原样：${entry.raw}`);
      continue;
    }
    if (seen.has(agent.id)) {
      dropped += 1;
      continue;
    }
    seen.add(agent.id);
    const line = `Co-authored-by: ${agent.name} <${agent.email}>`;
    if (line !== entry.raw) notes.push(`${entry.raw}  ->  ${line}`);
    out.push(line);
  }

  if (dropped > 0) notes.push(`删除 ${dropped} 条重复署名`);

  const lines = [...text.replace(/\r\n/g, '\n').split('\n')];
  lines.splice(trailer.start, trailer.end - trailer.start + 1, ...out);
  return { text: lines.join('\n'), notes };
}

function readInput(file) {
  if (file === '-' || file === undefined) return readFileSync(0, 'utf8');
  return readFileSync(resolve(file), 'utf8');
}

function checkRange(range, registry, strict, verbose) {
  const result = spawnSync('git', ['log', `--format=%H%x1f%B%x1e`, range], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stderr.trim() || 'git log 执行失败');
    process.exit(2);
  }
  const records = result.stdout.split('\x1e').map((r) => r.replace(/^\n/, '')).filter(Boolean);
  let failedCount = 0;
  for (const record of records) {
    const [sha, ...rest] = record.split('\x1f');
    const body = rest.join('\x1f');
    const label = sha.slice(0, 7);
    const { issues, failed } = checkMessage(label, body, registry, strict);
    const shown = issues.filter(([level]) => verbose || level !== 'info');
    if (shown.length === 0) continue;
    if (failed) failedCount += 1;
    for (const [level, code, detail] of shown) {
      console.log(`${label}  ${level.padEnd(5)}  ${code.padEnd(18)}  ${detail}`);
    }
    if (failed) console.log('');
  }
  console.log(`扫描 ${records.length} 个提交，${failedCount} 个未通过`);
  return failedCount === 0;
}

function usage() {
  console.log(`commit-trailer

  check --message <file|->            校验单条提交信息
  check --range <rev-range>           校验一组提交（如 origin/main..HEAD）
  fix   --message <file|->            归一化单条提交信息，输出到 stdout
  fix   --message <file> --write      原地写回
  list                                打印注册表

选项
  --strict    把 warning 也视为失败
  --verbose   输出 info 级提示（如邮箱未实测）
`);
}

function main(argv) {
  const [command, ...rest] = argv;
  const withValue = (flag, fallback) => {
    const i = rest.indexOf(flag);
    return i === -1 ? fallback : rest[i + 1];
  };
  const strict = rest.includes('--strict');
  const verbose = rest.includes('--verbose');
  const registry = loadRegistry();

  if (command === 'list') {
    for (const agent of registry) {
      console.log(`${agent.name.padEnd(12)} ${agent.email.padEnd(44)} ${agent.linked}`);
    }
    return 0;
  }

  if (command === 'check') {
    const range = withValue('--range');
    if (range) return checkRange(range, registry, strict, verbose) ? 0 : 1;

    const file = withValue('--message');
    if (!file) { usage(); return 2; }
    const label = file === '-' ? 'stdin' : file;
    const { issues, failed, errors, warns } = checkMessage(label, readInput(file), registry, strict);
    for (const [level, code, detail] of issues.filter(([l]) => verbose || l !== 'info')) {
      console.log(`${level.padEnd(5)}  ${code.padEnd(18)}  ${detail}`);
    }
    if (issues.length === 0) console.log('通过');
    else console.log(`\n${errors} 个错误，${warns} 个警告`);
    return failed ? 1 : 0;
  }

  if (command === 'fix') {
    const file = withValue('--message');
    if (!file) { usage(); return 2; }
    const { text, notes } = fixMessage(readInput(file), registry);
    if (rest.includes('--write') && file !== '-') {
      writeFileSync(resolve(file), text, 'utf8');
    } else {
      process.stdout.write(text);
    }
    for (const note of notes) console.error(`# ${note}`);
    return 0;
  }

  usage();
  return 2;
}

process.exit(main(process.argv.slice(2)));
