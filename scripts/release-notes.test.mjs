import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNotes } from './release-notes.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'release-notes.mjs');

const base = { tag: 'v1.2.0', prev: 'v1.1.0', total: 3, repo: 'owner/repo', date: '2026-11-18' };

test('groups conventional subjects into emoji sections and keeps full subjects', () => {
  const notes = buildNotes({ ...base, subjects: ['fix: b', 'feat: a', 'perf: c'] });
  assert.match(notes, /## v1\.2\.0 \(2026-11-18\)/);
  assert.match(notes, /3 commits \(\[v1\.1\.0\.\.\.v1\.2\.0\]\(https:\/\/github\.com\/owner\/repo\/compare\/v1\.1\.0\.\.\.v1\.2\.0\)\)/);
  const feat = notes.indexOf('### ✨ Features');
  const fix = notes.indexOf('### 🐛 Fixes');
  const perf = notes.indexOf('### ⚡ Performance');
  assert.ok(feat > -1 && fix > feat && perf > fix);
  assert.match(notes, /- feat: a/);
  assert.match(notes, /- fix: b/);
});

test('dedupes same subject text within a group, keeping the first wording', () => {
  const notes = buildNotes({ ...base, total: 2, subjects: ['feat: add x', 'feat(web): add x'] });
  assert.equal(notes.match(/- feat/g).length, 1);
  assert.match(notes, /- feat: add x/);
});

test('folds build, ci and revert into Chores and parses breaking-change markers', () => {
  const notes = buildNotes({ ...base, total: 4, subjects: ['build: a', 'ci: b', 'revert: c', 'feat!: d'] });
  const chores = notes.slice(notes.indexOf('### 🔧 Chores'));
  assert.match(chores, /- build: a/);
  assert.match(chores, /- ci: b/);
  assert.match(chores, /- revert: c/);
  assert.match(notes, /### ✨ Features\n\n- feat!: d/);
});

test('non-conventional subjects land in Other and empty groups are omitted', () => {
  const notes = buildNotes({ ...base, total: 1, subjects: ['just some words'] });
  assert.match(notes, /### 📦 Other\n\n- just some words/);
  assert.doesNotMatch(notes, /### ✨ Features/);
});

test('first tag links full history instead of a compare range', () => {
  const notes = buildNotes({ ...base, prev: '', total: 5, subjects: ['feat: a'] });
  assert.match(notes, /First release tag, 5 commits \(\[full history\]\(https:\/\/github\.com\/owner\/repo\/commits\/v1\.2\.0\)\)/);
  assert.doesNotMatch(notes, /compare/);
});

describe('CLI on a real repository', () => {
  let dir;
  const git = (...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  const commit = (msg) => {
    writeFileSync(join(dir, 'f.txt'), msg);
    git('add', 'f.txt');
    git('commit', '-q', '-m', msg);
  };
  const run = (tag) =>
    spawnSync(process.execPath, [SCRIPT, tag], {
      encoding: 'utf8',
      cwd: dir,
      env: { ...process.env, GITHUB_REPOSITORY: 'owner/repo' },
    });

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'ai-commit-trailer-notes-'));
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    commit('feat: first feature');
    git('tag', 'v0.1.0');
    commit('fix: a bug');
    commit('chore: tidy');
    git('tag', 'v0.2.0');
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('notes span previous tag to requested tag', () => {
    const r = run('v0.2.0');
    assert.equal(r.status, 0);
    assert.match(r.stdout, /2 commits \(\[v0\.1\.0\.\.\.v0\.2\.0\]/);
    assert.match(r.stdout, /### 🐛 Fixes\n\n- fix: a bug/);
    assert.match(r.stdout, /### 🔧 Chores\n\n- chore: tidy/);
    assert.doesNotMatch(r.stdout, /first feature/);
  });

  test('first tag falls back to full history', () => {
    const r = run('v0.1.0');
    assert.equal(r.status, 0);
    assert.match(r.stdout, /First release tag, 1 commits/);
    assert.match(r.stdout, /- feat: first feature/);
  });

  test('exits 2 on a non-version tag argument', () => {
    const r = run('--output=probe');
    assert.equal(r.status, 2);
  });
});