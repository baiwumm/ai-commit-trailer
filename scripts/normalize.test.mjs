import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'normalize.mjs');

function run(args, input) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { input, encoding: 'utf8' });
}

const CLEAN = 'feat: x\n\nBody.\n\nCo-authored-by: Trae <trae-agent@users.noreply.github.com>\nAssisted-by: Trae Agent:GLM-4.6\n';

test('fix keeps human co-authors whose email is outside the vendor domain', () => {
  const msg = 'fix: x\n\nCo-authored-by: Claude Dupont <claude.dupont@example.com>\nCo-authored-by: Pi <pi.person@gmail.com>\n';
  const r = run(['fix', '--message', '-'], msg);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, msg);
  assert.match(r.stderr, /possibly a human co-author/);
});

test('fix normalizes a name-only agent trailer', () => {
  const r = run(['fix', '--message', '-'], 'fix: x\n\nCo-authored-by: Trae\n');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Co-authored-by: Trae <trae-agent@users\.noreply\.github\.com>/);
});

test('fix normalizes a vendor-domain email variant', () => {
  const r = run(['fix', '--message', '-'], 'fix: x\n\nCo-authored-by: Claude <claude@anthropic.com>\n');
  assert.match(r.stdout, /Co-authored-by: Claude <noreply@anthropic\.com>/);
});

test('fix canonicalizes the name when the email already matches', () => {
  const r = run(['fix', '--message', '-'], 'fix: x\n\nCo-authored-by: Trae Agent <trae-agent@users.noreply.github.com>\n');
  assert.match(r.stdout, /Co-authored-by: Trae <trae-agent@users\.noreply\.github\.com>/);
});

test('fix strips a model name stuffed in parentheses', () => {
  const r = run(['fix', '--message', '-'], 'fix: x\n\nCo-authored-by: Trae (GLM-4.6) <trae-agent@users.noreply.github.com>\n');
  assert.match(r.stdout, /Co-authored-by: Trae <trae-agent@users\.noreply\.github\.com>/);
});

test('fix gathers an unseparated trailer into a blank-line-separated block', () => {
  const r = run(['fix', '--message', '-'], 'fix: x\nBody line\nCo-authored-by: Trae <trae-agent@users.noreply.github.com>\n');
  assert.equal(r.status, 0);
  assert.equal(r.stdout, 'fix: x\nBody line\n\nCo-authored-by: Trae <trae-agent@users.noreply.github.com>\n');
});

test('fix moves a mid-body stray co-author to the final block', () => {
  const msg = 'fix: x\n\nCo-authored-by: Trae <trae-agent@users.noreply.github.com>\n\nMore prose.\n';
  const r = run(['fix', '--message', '-'], msg);
  assert.equal(r.stdout, 'fix: x\n\nMore prose.\n\nCo-authored-by: Trae <trae-agent@users.noreply.github.com>\n');
});

test('fix merges a stray paragraph into an existing final trailer block', () => {
  const msg = 'fix: x\n\nCo-authored-by: Claude <noreply@anthropic.com>\n\nCo-authored-by: Trae <trae-agent@users.noreply.github.com>\nAssisted-by: Trae Agent:GLM-4.6\n';
  const r = run(['fix', '--message', '-'], msg);
  assert.equal(r.stdout, 'fix: x\n\nCo-authored-by: Trae <trae-agent@users.noreply.github.com>\nAssisted-by: Trae Agent:GLM-4.6\nCo-authored-by: Claude <noreply@anthropic.com>\n');
});

test('fix drops duplicate identities', () => {
  const msg = 'fix: x\n\nCo-authored-by: Trae <trae-agent@users.noreply.github.com>\nCo-authored-by: trae code <trae-agent@users.noreply.github.com>\n';
  const r = run(['fix', '--message', '-'], msg);
  assert.equal(r.stdout.match(/Co-authored-by/g).length, 1);
  assert.match(r.stderr, /Dropped 1 duplicate/);
});

test('fix leaves unknown agents untouched with a note', () => {
  const line = 'Co-authored-by: SomeBot <bot@somebot.dev>';
  const r = run(['fix', '--message', '-'], `fix: x\n\n${line}\n`);
  assert.match(r.stdout, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(r.stderr, /Unknown agent/);
});

test('fix preserves prose, Signed-off-by, and other trailers', () => {
  const msg = 'fix: x\n\nBody stays.\n\nSigned-off-by: Human <human@example.com>\nCo-authored-by: Trae <trae-agent@users.noreply.github.com>\n';
  const r = run(['fix', '--message', '-'], msg);
  assert.equal(r.stdout, msg);
});

test('fix leaves a human-only message unchanged', () => {
  const msg = 'fix: x\n\nJust prose.\n';
  const r = run(['fix', '--message', '-'], msg);
  assert.equal(r.stdout, msg);
  assert.match(r.stderr, /unchanged/);
});

test('fix handles CRLF input', () => {
  const r = run(['fix', '--message', '-'], 'fix: x\r\n\r\nCo-authored-by: Trae\r\n');
  assert.equal(r.stdout, 'fix: x\n\nCo-authored-by: Trae <trae-agent@users.noreply.github.com>\n');
});

test('fix --write rewrites the file in place', () => {
  const dir = mkdtempSync(join(tmpdir(), 'commit-trailer-'));
  try {
    const file = join(dir, 'msg.txt');
    writeFileSync(file, 'fix: x\n\nCo-authored-by: Trae\n');
    const r = run(['fix', '--message', file, '--write']);
    assert.equal(r.status, 0);
    assert.match(readFileSync(file, 'utf8'), /trae-agent@users\.noreply\.github\.com/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('check passes a clean message', () => {
  const r = run(['check', '--message', '-'], CLEAN);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /OK/);
});

test('check errors on missing email', () => {
  const r = run(['check', '--message', '-'], 'fix: x\n\nCo-authored-by: ZCode\n');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /missing-email/);
});

test('check errors on malformed email', () => {
  const r = run(['check', '--message', '-'], 'fix: x\n\nCo-authored-by: ZCode <agent@zcode>\n');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /invalid-email/);
});

test('check errors on a co-author outside the final trailer block', () => {
  const r = run(['check', '--message', '-'], 'fix: x\nBody\nCo-authored-by: Trae <trae-agent@users.noreply.github.com>\n');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /not-in-trailer-block/);
});

test('check warns on non-canonical name even when the email matches', () => {
  const r = run(['check', '--message', '-'], 'fix: x\n\nCo-authored-by: Trae Agent <trae-agent@users.noreply.github.com>\nAssisted-by: Trae Agent:GLM-4.6\n');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /non-canonical-name/);
});

test('check warns possible-human instead of suggesting a rewrite', () => {
  const r = run(['check', '--message', '-'], 'fix: x\n\nCo-authored-by: Claude <claude.dupont@example.com>\n');
  assert.match(r.stdout, /possible-human/);
  assert.doesNotMatch(r.stdout, /non-canonical-email/);
});

test('check warns when an AI co-author has no Assisted-by', () => {
  const r = run(['check', '--message', '-'], 'fix: x\n\nCo-authored-by: Trae <trae-agent@users.noreply.github.com>\n');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /missing-assisted-by/);
});

test('check does not demand Assisted-by for human-only co-authors', () => {
  const r = run(['check', '--message', '-'], 'fix: x\n\nCo-authored-by: Human <human@example.com>\n');
  assert.doesNotMatch(r.stdout, /missing-assisted-by/);
});

test('check --strict fails on warnings', () => {
  const r = run(['check', '--message', '-', '--strict'], 'fix: x\n\nCo-authored-by: Trae Agent <trae-agent@users.noreply.github.com>\nAssisted-by: Trae Agent:GLM-4.6\n');
  assert.equal(r.status, 1);
});

test('check flags model-in-name', () => {
  const r = run(['check', '--message', '-'], 'fix: x\n\nCo-authored-by: Trae (GLM-4.6) <trae-agent@users.noreply.github.com>\nAssisted-by: Trae Agent:GLM-4.6\n');
  assert.match(r.stdout, /model-in-name/);
});

test('check hides info notes unless --verbose', () => {
  const msg = 'fix: x\n\nCo-authored-by: ZCode <noreply@zcode.ai>\nAssisted-by: ZCode:x\n';
  const plain = run(['check', '--message', '-'], msg);
  const verbose = run(['check', '--message', '-', '--verbose'], msg);
  assert.doesNotMatch(plain.stdout, /unverified-link/);
  assert.match(verbose.stdout, /unverified-link/);
});

test('check rejects a flag swallowed as --message value', () => {
  const r = run(['check', '--message', '--strict'], '');
  assert.equal(r.status, 2);
  assert.doesNotMatch(r.stderr, /ENOENT/);
});

test('check rejects --range and --message together', () => {
  const r = run(['check', '--range', 'HEAD', '--message', '-'], CLEAN);
  assert.equal(r.status, 2);
});

test('--help exits 0', () => {
  const r = run(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Exit codes/);
});

test('list prints the registry', () => {
  const r = run(['list']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Trae\s+trae-agent@users\.noreply\.github\.com\s+verified/);
});

test('check --range cannot inject git options like --output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'commit-trailer-'));
  try {
    const probe = join(dir, 'probe');
    const r = run(['check', '--range', `--output=${probe}`]);
    assert.equal(r.status, 2);
    assert.equal(existsSync(probe), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('check --range on a real repository', () => {
  let dir;
  const git = (...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'commit-trailer-repo-'));
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    writeFileSync(join(dir, 'a.txt'), 'a');
    git('add', 'a.txt');
    git('commit', '-q', '-m', 'feat: good\n\nCo-authored-by: Trae <trae-agent@users.noreply.github.com>\nAssisted-by: Trae Agent:GLM-4.6');
    writeFileSync(join(dir, 'b.txt'), 'b');
    git('add', 'b.txt');
    git('commit', '-q', '-m', 'feat: bad\n\nCo-authored-by: ZCode');
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('reports the failing commit and exits 1', () => {
    const r = spawnSync(process.execPath, [SCRIPT, 'check', '--range', 'HEAD~1..HEAD'], { encoding: 'utf8', cwd: dir });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /missing-email/);
    assert.match(r.stdout, /Scanned 1 commit\(s\), 1 failed/);
  });

  test('passes a clean range', () => {
    const r = spawnSync(process.execPath, [SCRIPT, 'check', '--range', 'HEAD~1'], { encoding: 'utf8', cwd: dir });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /0 failed/);
  });

  test('exits 2 on an invalid range', () => {
    const r = spawnSync(process.execPath, [SCRIPT, 'check', '--range', 'no-such-ref..HEAD'], { encoding: 'utf8', cwd: dir });
    assert.equal(r.status, 2);
  });
});