# ai-commit-trailer

[![test](https://github.com/baiwumm/ai-commit-trailer/actions/workflows/test.yml/badge.svg)](https://github.com/baiwumm/ai-commit-trailer/actions/workflows/test.yml)

An agent skill that fixes AI attribution trailers in Git commit messages, so GitHub actually credits the right account.

GitHub parses exactly one trailer: `Co-authored-by`. It needs `Name <email>`, and the email must belong to a GitHub account. Tools write this field inconsistently — some omit the email, some use a model name as the display name, some use a different address every release. The result is an unlinked name in the commit and a fragmented Contributors list.

This skill normalizes what your agent writes, checks what is already there, and keeps a canonical identity for each agent surface.

## Install

```bash
npx skills add baiwumm/ai-commit-trailer
```

Update an installed copy with `npx skills update ai-commit-trailer` (`-g` for global, `-p` for project scope). The registry ships inside the skill, so updating the skill updates the registry.

Works with any agent host that can read a skill directory. The script needs Node 18 or newer and a working `git`.

## Format

```text
feat(web): mirror the skeleton cards

Body text stays exactly as written.

Co-authored-by: Trae <trae-agent@users.noreply.github.com>
Assisted-by: Trae Agent:GLM-4.6
```

- `Co-authored-by` — the only trailer GitHub parses. Drives the multi-author display, Contributors list, and profile contribution counts.
- `Assisted-by` — disclosure only. GitHub ignores it. Carries `host:model`.

## Usage

```bash
node scripts/normalize.mjs list
node scripts/normalize.mjs check --message .git/COMMIT_TRAILER_MSG
node scripts/normalize.mjs check --range origin/main..HEAD
node scripts/normalize.mjs fix --message .git/COMMIT_TRAILER_MSG
```

`check` exits 0 on pass, 1 on check failures, 2 on usage or git errors; add `--strict` to fail on warnings and `--verbose` to show info-level notes. `fix` rewrites resolvable `Co-authored-by` lines, drops duplicates, gathers stray co-author lines into a proper final trailer block, and never touches prose or history. Co-authors whose email sits outside the agent's vendor domain are treated as possible humans and kept untouched.

## Registry

`references/agents.json` maps each agent to a canonical name, email, and aliases. Each entry carries `linked`, one of `verified`, `documented`, or `inferred`, plus checkable `sources` (official docs, vendor source, or concrete community examples) and `checkedAt`. Entries distinguish vendor defaults from community conventions the tool itself does not write. A product can have more than one entry when it writes different GitHub identities; resolution prefers the entry whose email matches the trailer.

`verified` is only set when the email was observed producing a linked contributor in a real repository. If you add an agent, keep that discipline: an honest `inferred` beats a wrong `verified`. Hosts that can commit but write no `Co-authored-by` trailer are listed in [references/conventions.md](references/conventions.md#hosts-that-write-no-trailer), not guessed into the registry; the same file's "Keeping the registry current" section is the checklist for adding one.

## Tests

```bash
node --test
```

## Limits

- Never rewrites pushed history.
- Does not decide whether AI attribution should exist — that is your repository policy.
- Cannot verify an account linkage by itself; it reports what the registry knows.
- Trailer semantics and GitHub recognition rules are documented in [references/conventions.md](references/conventions.md).