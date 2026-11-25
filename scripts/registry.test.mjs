import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REGISTRY_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'references', 'agents.json');
const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const LINKED = new Set(['verified', 'documented', 'inferred']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

test('registry schema version is current', () => {
  assert.equal(registry.schemaVersion, 3);
  assert.match(registry.updated, DATE);
});

test('registry updated is not older than any entry', () => {
  const newest = registry.agents.map((agent) => agent.checkedAt).sort().at(-1);
  assert.ok(registry.updated >= newest, `updated ${registry.updated} is older than ${newest}`);
});

test('every entry has the required fields', () => {
  for (const agent of registry.agents) {
    for (const field of ['id', 'name', 'email', 'aliases', 'patterns', 'linked', 'sources', 'checkedAt']) {
      assert.ok(agent[field] !== undefined, `${agent.id ?? '?'} missing ${field}`);
    }
  }
});

test('ids are unique and emails are well-formed', () => {
  const ids = registry.agents.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const agent of registry.agents) {
    assert.match(agent.email, EMAIL, `${agent.id} email`);
  }
});

test('linked uses the evidence vocabulary', () => {
  for (const agent of registry.agents) {
    assert.ok(LINKED.has(agent.linked), `${agent.id} linked=${agent.linked}`);
  }
});

test('sources is a non-empty array of checkable references', () => {
  for (const agent of registry.agents) {
    assert.ok(Array.isArray(agent.sources) && agent.sources.length > 0, `${agent.id} sources`);
    for (const source of agent.sources) {
      assert.equal(typeof source, 'string');
      assert.ok(source.length > 0, `${agent.id} empty source`);
    }
  }
});

test('verified entries cite an observation, not a guess', () => {
  for (const agent of registry.agents.filter((a) => a.linked === 'verified')) {
    assert.ok(agent.sources.some((s) => /observed/i.test(s)), `${agent.id} verified without observation`);
  }
});

test('checkedAt is a valid date and aliases are lowercase', () => {
  for (const agent of registry.agents) {
    assert.match(agent.checkedAt, DATE, `${agent.id} checkedAt`);
    for (const alias of agent.aliases) {
      assert.equal(alias, alias.toLowerCase(), `${agent.id} alias ${alias}`);
    }
  }
});

test('patterns compile as regular expressions', () => {
  for (const agent of registry.agents) {
    for (const pattern of agent.patterns) {
      assert.doesNotThrow(() => new RegExp(pattern, 'i'), `${agent.id} pattern ${pattern}`);
    }
  }
});

test('inferred entries carry an unproven caveat', () => {
  for (const agent of registry.agents.filter((a) => a.linked === 'inferred')) {
    assert.ok(agent.note && /unproven|unverified/i.test(agent.note), `${agent.id} inferred without caveat`);
  }
});

test('aider email matches the vendor source (regression: was noreply@aider.chat)', () => {
  const aider = registry.agents.find((a) => a.id === 'aider');
  assert.equal(aider.email, 'aider@aider.chat');
  assert.ok(aider.sources.some((s) => s.includes('Aider-AI/aider')));
});