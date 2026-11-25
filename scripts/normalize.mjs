#!/usr/bin/env node
// ai-commit-trailer: validate and normalize AI attribution trailers in commit messages.
// Only trailer lines are touched; prose and history are never rewritten.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = join(SCRIPT_DIR, '..', 'references', 'agents.json');

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

function resolveAgent(name, email, registry) {
  const base = name.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!base) return null;
  // Tolerate `Trae (GLM-4.6)` style names with the model stuffed in parentheses.
  const candidates = [...new Set([base, base.replace(/\s*\([^()]*\)\s*$/, '').trim()])];
  const matches = registry.filter((agent) => candidates.some((key) =>
    agent.aliases.includes(key) || agent.regexes.some((re) => re.test(key))));
  // A product can write more than one identity (Copilot CLI/App vs older Copilot).
  // Prefer the entry whose email is the one actually in the trailer.
  if (email) {
    const exact = matches.find((agent) => agent.email.toLowerCase() === email.toLowerCase());
    if (exact) return exact;
  }
  return matches[0] ?? null;
}

function emailDomain(email) {
  return email.split('@')[1]?.toLowerCase() ?? '';
}

// A resolved name whose email sits outside the agent's vendor domain is likely
// a human who happens to share the name (Claude, Pi, Kimi...). Never rewrite it.
function classifyCoAuthor(value, registry) {
  const { name, email } = splitIdentity(value);
  const agent = resolveAgent(name, email, registry);
  const humanLike = Boolean(agent && email && EMAIL.test(email)
    && email.toLowerCase() !== agent.email.toLowerCase()
    && emailDomain(email) !== emailDomain(agent.email));
  return { name, email, agent, humanLike };
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

  if (!isTrailerBlock) return { lines, trailer: null, stray: collectStrayCoAuthors(lines) };

  const parsed = block.map((line) => {
    const m = line.match(TRAILER_LINE);
    return { key: m[1].toLowerCase(), raw: line, value: m[2] };
  });
  return {
    lines,
    trailer: { start, end, entries: parsed },
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

  const { name, email, agent, humanLike } = classifyCoAuthor(entry.value, registry);

  if (!email) {
    const hint = agent ? `; suggest ${agent.name} <${agent.email}>` : '';
    issues.push(['error', 'missing-email', `${entry.raw} — missing <email>, GitHub will not parse it${hint}`]);
  } else if (!EMAIL.test(email)) {
    issues.push(['error', 'invalid-email', `${entry.raw} — malformed email`]);
  }

  if (agent && !humanLike) {
    const canonical = `${agent.name} <${agent.email}>`;
    if (email && EMAIL.test(email)) {
      if (email.toLowerCase() === agent.email.toLowerCase()) {
        if (name !== agent.name) {
          issues.push(['warn', 'non-canonical-name', `${entry.raw} — suggest ${canonical}`]);
        }
      } else {
        issues.push(['warn', 'non-canonical-email', `${entry.raw} — suggest ${canonical}`]);
      }
    }
    if (seen.has(agent.id)) {
      issues.push(['warn', 'duplicate-identity', `${entry.raw} — duplicate of earlier ${agent.name}`]);
    }
    seen.add(agent.id);
    if (agent.linked === 'inferred') {
      issues.push(['info', 'unverified-link', `${agent.name}'s email is unverified; it may not count toward Contributors`]);
    }
  } else if (humanLike) {
    issues.push(['warn', 'possible-human', `${entry.raw} — email outside ${agent.name}'s vendor domain; may be a human co-author, fix keeps it`]);
  } else if (email) {
    issues.push(['warn', 'unknown-agent', `${entry.raw} — not in the registry, cannot validate`]);
  } else {
    issues.push(['warn', 'unknown-agent', `${entry.raw} — not in the registry and missing email`]);
  }

  if (/[()]/.test(name)) {
    issues.push(['warn', 'model-in-name', `${entry.raw} — model info belongs in Assisted-by, not the name`]);
  }
  return issues;
}

function checkMessage(label, text, registry, strict) {
  const { trailer, stray } = parseMessage(text);
  const issues = [];

  for (const line of stray) {
    issues.push(['error', 'not-in-trailer-block',
      `${label}:${line.index} — ${line.raw} is not inside the final trailer block`]);
  }

  if (!trailer) {
    issues.push(['info', 'no-trailer', `${label} — no trailer block (normal for human-only commits)`]);
  } else {
    const seen = new Set();
    let hasAiCoAuthor = false;
    let hasAssistedBy = false;
    for (const entry of trailer.entries) {
      if (entry.key === 'assisted-by') hasAssistedBy = true;
      if (entry.key === 'co-authored-by') {
        const { agent, humanLike } = classifyCoAuthor(entry.value, registry);
        if (agent && !humanLike) hasAiCoAuthor = true;
      }
      for (const issue of checkEntry(entry, registry, seen)) issues.push(issue);
    }
    if (hasAiCoAuthor && !hasAssistedBy) {
      issues.push(['warn', 'missing-assisted-by', `${label} — AI co-author present but no Assisted-by: host:model disclosure`]);
    }
  }

  const errors = issues.filter((i) => i[0] === 'error').length;
  const warns = issues.filter((i) => i[0] === 'warn').length;
  const failed = errors > 0 || (strict && warns > 0);
  return { issues, failed, errors, warns };
}

function fixMessage(text, registry) {
  const normalized = text.replace(/\r\n/g, '\n');
  const { lines, trailer, stray } = parseMessage(normalized);
  if (!trailer && stray.length === 0) {
    return { text, notes: ['No trailer block or stray Co-authored-by lines; unchanged'] };
  }

  const notes = [];
  const seen = new Set();
  const out = [];
  let dropped = 0;

  const fixCoAuthor = (raw, value) => {
    const { agent, humanLike } = classifyCoAuthor(value, registry);
    if (!agent) {
      notes.push(`Unknown agent, kept as-is: ${raw}`);
      return raw;
    }
    if (humanLike) {
      notes.push(`Email outside vendor domain, possibly a human co-author; kept as-is: ${raw}`);
      return raw;
    }
    if (seen.has(agent.id)) {
      dropped += 1;
      return null;
    }
    seen.add(agent.id);
    const line = `Co-authored-by: ${agent.name} <${agent.email}>`;
    if (line !== raw) notes.push(`${raw}  ->  ${line}`);
    return line;
  };

  if (trailer) {
    for (const entry of trailer.entries) {
      if (entry.key !== 'co-authored-by') {
        out.push(entry.raw);
        continue;
      }
      const line = fixCoAuthor(entry.raw, entry.value);
      if (line !== null) out.push(line);
    }
  }
  for (const s of stray) {
    const line = fixCoAuthor(s.raw, s.value);
    if (line !== null) {
      out.push(line);
      notes.push(`Moved into the final trailer block: ${s.raw}`);
    }
  }

  if (dropped > 0) notes.push(`Dropped ${dropped} duplicate co-author line(s)`);

  const newLines = [...lines];
  const strayIndices = stray.map((s) => s.index - 1).sort((a, b) => b - a);
  let removedBeforeBlock = 0;
  for (const idx of strayIndices) {
    newLines.splice(idx, 1);
    let removed = 1;
    // Collapse the double blank line left behind when the stray sat between paragraphs.
    if (idx > 0 && newLines[idx - 1]?.trim() === '' && newLines[idx]?.trim() === '') {
      newLines.splice(idx, 1);
      removed += 1;
    }
    if (trailer && idx < trailer.start) removedBeforeBlock += removed;
  }

  if (trailer) {
    // Stray lines always precede the block when a block exists.
    const start = trailer.start - removedBeforeBlock;
    const end = trailer.end - removedBeforeBlock;
    newLines.splice(start, end - start + 1, ...out);
  } else {
    while (newLines.length && newLines[newLines.length - 1].trim() === '') newLines.pop();
    newLines.push('', ...out);
    if (normalized.endsWith('\n')) newLines.push('');
  }
  return { text: newLines.join('\n'), notes };
}

function readInput(file) {
  if (file === '-' || file === undefined) return readFileSync(0, 'utf8');
  return readFileSync(resolve(file), 'utf8');
}

function checkRange(range, registry, strict, verbose) {
  const result = spawnSync('git', ['log', '--format=%H%x1f%B%x1e', '--end-of-options', range], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    console.error(result.stderr.trim() || 'git log failed');
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
  console.log(`Scanned ${records.length} commit(s), ${failedCount} failed`);
  return failedCount === 0;
}

function usage() {
  console.log(`ai-commit-trailer

  check --message <file|->            Validate one commit message
  check --range <rev-range>           Validate a set of commits (e.g. origin/main..HEAD)
  fix   --message <file|->            Normalize one commit message, print to stdout
  fix   --message <file> --write      Rewrite the file in place
  list                                Print the registry

Options
  --strict    Treat warnings as failures too
  --verbose   Show info-level notes (e.g. unverified emails)
  --help      Show this help

Exit codes: 0 pass, 1 check failed, 2 usage or git error`);
}

function main(argv) {
  const [command, ...rest] = argv;
  if (command === '--help' || command === '-h') { usage(); return 0; }

  const withValue = (flag) => {
    const i = rest.indexOf(flag);
    if (i === -1) return undefined;
    const value = rest[i + 1];
    return value && !value.startsWith('--') ? value : undefined;
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
    const file = withValue('--message');
    if (range && file) {
      console.error('Use either --range or --message, not both');
      usage();
      return 2;
    }
    if (range) return checkRange(range, registry, strict, verbose) ? 0 : 1;
    if (!file) { usage(); return 2; }
    const label = file === '-' ? 'stdin' : file;
    const { issues, failed, errors, warns } = checkMessage(label, readInput(file), registry, strict);
    for (const [level, code, detail] of issues.filter(([l]) => verbose || l !== 'info')) {
      console.log(`${level.padEnd(5)}  ${code.padEnd(18)}  ${detail}`);
    }
    if (issues.length === 0) console.log('OK');
    else console.log(`\n${errors} error(s), ${warns} warning(s)`);
    return failed ? 1 : 0;
  }

  if (command === 'fix') {
    const file = withValue('--message');
    if (!file) { usage(); return 2; }
    const { text, notes } = fixMessage(readInput(file), registry);
    if (rest.includes('--write') && file !== '-') {
      writeFileSync(resolve(file), text, 'utf8');
    } else {
      if (rest.includes('--write')) notes.push('--write ignored for stdin; output goes to stdout');
      process.stdout.write(text);
    }
    for (const note of notes) console.error(`# ${note}`);
    return 0;
  }

  usage();
  return 2;
}

process.exit(main(process.argv.slice(2)));