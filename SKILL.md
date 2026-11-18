---
name: ai-commit-trailer
description: Fix Git commit trailers so GitHub credits AI co-authors. Use when writing or checking Co-authored-by or other AI attribution trailers before committing.
---

# AI Commit Trailer

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
4. Save the message to a file, run `check` on it, and apply `fix` or edit by hand until `check` exits 0. That exit code is the completion criterion for the message.
5. Commit with the checked file: `git commit -F <file>`. For `check --range` failures, report the findings; rewriting existing commits is a separate, explicit decision (see Do not).

## Commands

Run from the repository root. `SKILL_DIR` is the absolute path of the directory containing this SKILL.md. The message file below lives inside `.git/`, so it works on every platform and is never committed.

```bash
node "$SKILL_DIR/scripts/normalize.mjs" list
node "$SKILL_DIR/scripts/normalize.mjs" check --message .git/COMMIT_TRAILER_MSG
node "$SKILL_DIR/scripts/normalize.mjs" check --range origin/main..HEAD
node "$SKILL_DIR/scripts/normalize.mjs" fix --message .git/COMMIT_TRAILER_MSG
node "$SKILL_DIR/scripts/normalize.mjs" fix --message .git/COMMIT_TRAILER_MSG --write
```

- `check` exits 0 on pass, 1 on check failures, 2 on usage or git errors. Add `--strict` to fail on warnings, `--verbose` to see unverified-link notes. It warns when an AI co-author has no `Assisted-by`.
- `fix` rewrites resolvable `Co-authored-by` lines to canonical form, drops duplicates, and gathers stray co-author lines into a blank-line-separated final trailer block. It never edits prose or non-AI trailers, and prints its notes to stderr.
- A co-author whose email sits outside the agent's vendor domain is treated as a possible human (people are named Claude, Pi, Kimi too): both `check` and `fix` keep it untouched. Unknown agents are also kept, with a note; edit those by hand after confirming the identity.

To check the message you are about to write, save it first with `git log -1 --format=%B > .git/COMMIT_TRAILER_MSG`, or pipe a heredoc into `check --message -`.

## Registry

`references/agents.json` holds one entry per agent: `name`, `email`, `aliases`, `patterns`, `linked`, `sources`, `checkedAt`, and an optional `note` for caveats.

- `linked: verified` means the email was observed producing a linked contributor in a real repository.
- `documented` means an official doc, vendor source code, or community test record exists.
- `inferred` means the email is unproven.

When adding an agent: add aliases for every variant seen in the wild, cite checkable `sources` (official doc page, vendor source file, or concrete community example — never a bare "seen somewhere"), set `checkedAt` to today, and do not mark `verified` without evidence from a real Contributors list. A wrong `verified` is worse than an honest `inferred`. Distinguish vendor defaults (the tool writes the trailer) from community conventions (the tool writes nothing; repositories converged via hooks) — mark the latter in `note`.

Do not invent an email for an agent that ships none — including `login@users.noreply.github.com` guesses, which assert a specific account exists. Leave it out of the registry and let `check` flag it as unknown so a human decides.

## Do not

- Rewrite pushed history. Normalization applies to new commits; rewriting an existing branch is a separate, explicit decision.
- Touch the commit body, non-AI trailers, or `Signed-off-by`.
- Add a trailer when no AI participated.
- Reuse one agent's email for another product.

Read `references/conventions.md` when the trailer semantics or GitHub's recognition rules matter.