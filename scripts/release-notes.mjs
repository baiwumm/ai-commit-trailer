import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const GROUPS = [
  ['feat', '✨ Features'],
  ['fix', '🐛 Fixes'],
  ['perf', '⚡ Performance'],
  ['refactor', '♻️ Refactoring'],
  ['docs', '📝 Documentation'],
  ['test', '✅ Tests'],
  ['style', '💄 Styles'],
  ['chore', '🔧 Chores'],
];

const SUBJECT = /^(feat|fix|docs|style|refactor|perf|test|chore|build|ci|revert)(\([^)]*\))?(!)?:\s*(.+)$/;

export function buildNotes({ tag, prev, subjects, total, repo, date }) {
  const buckets = new Map(GROUPS.map(([key]) => [key, new Map()]));
  const others = new Map();
  for (const subject of subjects) {
    const m = subject.match(SUBJECT);
    const text = m ? m[4].trim() : subject;
    const key = m ? (['build', 'ci', 'revert'].includes(m[1]) ? 'chore' : m[1]) : 'other';
    const bucket = key === 'other' ? others : buckets.get(key);
    if (!bucket.has(text)) bucket.set(text, subject);
  }

  const lines = [`## ${tag} (${date})`, ''];
  lines.push(
    prev
      ? `${total} commits ([${prev}...${tag}](https://github.com/${repo}/compare/${prev}...${tag})).`
      : `First release tag, ${total} commits ([full history](https://github.com/${repo}/commits/${tag})).`
  );
  for (const [key, title] of GROUPS) {
    const items = [...buckets.get(key).values()];
    if (!items.length) continue;
    lines.push('', `### ${title}`, '');
    for (const subject of items) lines.push(`- ${subject}`);
  }
  if (others.size) {
    lines.push('', '### 📦 Other', '');
    for (const subject of others.values()) lines.push(`- ${subject}`);
  }
  return lines.join('\n') + '\n';
}

function git(...args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr.trim() || `git ${args.join(' ')} failed`);
  return r.stdout.trim();
}

function repoSlug() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const m = git('remote', 'get-url', 'origin').match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  if (!m) throw new Error('cannot derive owner/repo from origin remote; set GITHUB_REPOSITORY');
  return m[1];
}

function main() {
  const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
  if (!tag || !/^v\d/.test(tag)) {
    console.error('usage: node scripts/release-notes.mjs <vX.Y.Z> (or set GITHUB_REF_NAME)');
    process.exit(2);
  }
  const repo = repoSlug();
  let prev = '';
  try {
    prev = git('describe', '--tags', '--abbrev=0', `${tag}^`);
  } catch {
    prev = '';
  }
  const range = prev ? `${prev}..${tag}` : tag;
  const total = Number(git('rev-list', '--count', range, '--'));
  const subjects = git('log', '--format=%s', range, '--').split(/\r?\n/).filter(Boolean);
  process.stdout.write(buildNotes({ tag, prev, subjects, total, repo, date: new Date().toISOString().slice(0, 10) }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
}