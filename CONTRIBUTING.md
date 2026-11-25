# Contributing

Thanks for taking the time to contribute. This repository is maintained by a
single maintainer, so short, focused changes are easiest to review.

## Before you start

- Read [SKILL.md](SKILL.md) for the trailer format and registry discipline, and
  [AGENTS.md](AGENTS.md) for the repository's commit rules.
- For a new agent identity, collect the exact `Co-authored-by` line, a public
  commit URL, and a vendor doc or source URL. Do not invent an email; a tool
  that writes no trailer belongs in `references/conventions.md`.
- For a bug, include the command, input message, Node and git versions, and
  actual versus expected output.

## Development

Requirements: Node 18 or newer and a working `git`. CI runs on Node 22 and 24.

```bash
node --test
node scripts/normalize.mjs check --message .git/COMMIT_TRAILER_MSG
```

## Pull requests

- Keep the diff focused: one logical change per PR.
- Use Conventional Commits in English (`feat:`, `fix:`, `docs:`, ...).
- Registry changes must pass the checklist in the pull request template and run
  `node --test`.
- If an AI assistant helped, add the `Co-authored-by` and `Assisted-by` trailers
  described in [AGENTS.md](AGENTS.md).
- Report vulnerabilities through [SECURITY.md](SECURITY.md), not a public issue.
