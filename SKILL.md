---
name: commit-trailer
description: Fix Git commit trailers so GitHub credits AI co-authors. Use when writing or checking Co-authored-by, Assisted-by, or any AI attribution trailer. Do not rewrite pushed history.
---

# Commit Trailer

Make AI attribution in commit messages canonical, so GitHub resolves it to the right account instead of showing an unlinked name.

## The format

```text
feat(web): mirror the skeleton cards

Body text stays exactly as written.

Co-authored-by: Trae <trae-agent@users.noreply.github.com>
Assisted-by: Trae Agent:GLM-4.6
```

- `Co-authored-by` is the only trailer GitHub parses. It drives the multi-author display, the Contributors list, and profile contribution counts. It requires `Name <email>`.
- `Assisted-by` is disclosure only. GitHub ignores it. Use it for `host:model`.
- Both live in the final trailer block: after the body, one blank line, contiguous lines.
- Human-only work gets no AI trailer at all.

Never put a model name inside the `Co-authored-by` name. `Trae (GLM-4.6)` becomes a literal display name on GitHub; the model belongs in `Assisted-by`.

## Procedure

1. Decide which agent actually did the work. Use the agent that ran the session, not every tool that touched a file.
2. Resolve its canonical identity in `references/agents.json`. Match by product, not by the string the tool happened to write.
3. Compose both trailers: product name plus registry email in `Co-authored-by`, `host:model` in `Assisted-by`.
4. Run `check` below. Fix anything it reports before committing.

## Commands

Run from the repository root. `SKILL_DIR` is this skill's directory.

```bash
node "$SKILL_DIR/scripts/normalize.mjs" list
node "$SKILL_DIR/scripts/normalize.mjs" check --message /tmp/msg.txt
node "$SKILL_DIR/scripts/normalize.mjs" check --range origin/main..HEAD
node "$SKILL_DIR/scripts/normalize.mjs" fix --message /tmp/msg.txt
node "$SKILL_DIR/scripts/normalize.mjs" fix --message /tmp/msg.txt --write
```

- `check` exits 1 on errors. Add `--strict` to fail on warnings, `--verbose` to see unverified-link notes.
- `fix` rewrites only `Co-authored-by` lines it can resolve, drops duplicates, and prints a diff of notes to stderr. It never edits the body.
- `fix` refuses nothing, but leaves unknown agents untouched with a note. Edit those by hand after confirming the identity.

To check the message you are about to write, save it first with `git log -1 --format=%B > /tmp/msg.txt`, or pipe a heredoc into `check --message -`.

## Registry

`references/agents.json` holds one entry per agent: `name`, `email`, `aliases`, `patterns`, `linked`, `source`, `verifiedAt`.

- `linked: verified` means the email was observed producing a linked contributor in a real repository.
- `documented` means an official doc or community report exists.
- `inferred` means the email follows the vendor domain but is unproven.

When adding an agent: add aliases for every variant seen in the wild, cite a `source`, set `verifiedAt` to today, and do not mark `verified` without evidence from a real Contributors list. A wrong `verified` is worse than an honest `inferred`.

Do not invent an email for an agent that ships none. Leave it out of the registry and let `check` flag it as unknown so a human decides.

## Do not

- Rewrite pushed history. Normalization applies to new commits; rewriting an existing branch is a separate, explicit decision.
- Touch the commit body, non-AI trailers, or `Signed-off-by`.
- Add a trailer when no AI participated.
- Reuse one agent's email for another product.

Read `references/conventions.md` when the trailer semantics or GitHub's recognition rules matter.
