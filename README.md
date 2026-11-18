# commit-trailer

An agent skill that fixes AI attribution trailers in Git commit messages, so GitHub actually credits the right account.

GitHub parses exactly one trailer: `Co-authored-by`. It needs `Name <email>`, and the email must belong to a GitHub account. Tools write this field inconsistently — some omit the email, some use a model name as the display name, some use a different address every release. The result is an unlinked name in the commit and a fragmented Contributors list.

This skill normalizes what your agent writes, checks what is already there, and keeps one canonical identity per product.

## Install

```bash
npx skills add <owner>/commit-trailer
```

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
node scripts/normalize.mjs check --message /tmp/msg.txt
node scripts/normalize.mjs check --range origin/main..HEAD
node scripts/normalize.mjs fix --message /tmp/msg.txt
```

`check` exits 1 on errors, add `--strict` to fail on warnings. `fix` rewrites only resolvable `Co-authored-by` lines, drops duplicates, and never touches the body or history.

## Registry

`references/agents.json` maps each agent to a canonical name, email, and aliases. Each entry carries `linked`, one of `verified`, `documented`, or `inferred`, plus a `source` and `verifiedAt`.

`verified` is only set when the email was observed producing a linked contributor in a real repository. If you add an agent, keep that discipline: an honest `inferred` beats a wrong `verified`.

## Limits

- Never rewrites pushed history.
- Does not decide whether AI attribution should exist — that is your repository policy.
- Cannot verify an account linkage by itself; it reports what the registry knows.
- Trailer semantics and GitHub recognition rules are documented in [references/conventions.md](references/conventions.md).
