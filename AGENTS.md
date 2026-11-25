# AGENTS.md

Policy for agents working in this repository. Trailer format and the check procedure have their single source of truth in [SKILL.md](SKILL.md), and registry data lives in [references/agents.json](references/agents.json); keep this file to repository-local rules.

## Commits

- **AI-assisted commits must carry both trailers** — `Co-authored-by` (product name + registry email) and `Assisted-by` (`host:model`) — in the final trailer block. Human-only commits carry no AI trailer.
- Conventional Commits in English (`feat:`, `fix:`, `docs:`, ...); the release workflow groups notes by these types.
- Match the co-author identity by the product that ran the session, from `references/agents.json`. The model name comes from the user or the UI; ask when unknown, never guess.
- Before committing: save the message to `.git/COMMIT_TRAILER_MSG` and run `node scripts/normalize.mjs check --message .git/COMMIT_TRAILER_MSG`; exit 0 is the gate, then `git commit -F .git/COMMIT_TRAILER_MSG`.
- `node --test` passes before committing; CI runs it on Node 22/24.
- Never rewrite pushed history; rewriting unpushed history needs an explicit user request.