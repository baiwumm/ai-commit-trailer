## What does this PR change?

<!-- New registry entry / linked-level upgrade / script or doc fix / other -->

Closes #

## For registry changes (references/agents.json)

- [ ] Every new or changed entry has checkable `sources`: an official doc page, a vendor source file, or a concrete community example — no "seen somewhere", no private repos
- [ ] `linked` matches the evidence: `verified` only with an observed linked contributor in a real Contributors list; `documented` for official docs, vendor source, or community test records; otherwise `inferred` with a `note` saying unproven
- [ ] If the tool itself writes no trailer, it is added to `references/conventions.md` instead of the registry
- [ ] If a product has more than one identity (for example Copilot CLI/App vs GitHub Copilot), the trailer email selects the entry and a regression test covers both
- [ ] `aliases` and `patterns` cover the spellings seen in the wild without being broader than the product
- [ ] `checkedAt` is set to today and `registry.updated` is not older than any `checkedAt`
- [ ] No invented emails — an agent that ships no identity stays out of the registry and is flagged as unknown

## Verification

- [ ] `node --test` passes locally
- [ ] The commit message passes `node scripts/normalize.mjs check --message <file>` when trailers changed
- [ ] For an upgrade to `verified`: link the repository whose Contributors list shows the linked account

See the Registry section of SKILL.md for the full discipline: an honest `inferred` beats a wrong `verified`.
