# Trailer semantics and GitHub rules

## The four trailers and their roles

| Trailer | Who parses it | Meaning | Email required |
| --- | --- | --- | --- |
| `Co-authored-by` | GitHub, GitLab | Co-author; shared credit and responsibility | Yes: `Name <email>`, and the email must be bound to an account |
| `Assisted-by` | Nobody (plain text) | Discloses assistance; claims no authorship | No; convention is `Host:model` |
| `Generated-by` | Nobody (plain text) | Declares the change was almost entirely tool-generated (Mesa convention) | No |
| `Signed-off-by` | DCO checkers | A legal sign-off, not AI disclosure | Yes, but the meaning is entirely different |

**Only `Co-authored-by` is parsed by GitHub.** It appears in the commit page's multi-author area, counts toward the repository's Contributors, and enters personal contribution graphs. Other trailers such as `Assisted-by` are only visible in the raw `git log`; GitHub's UI does not display them at all.

## How GitHub recognizes `Co-authored-by`

1. It must sit in the **trailer block at the end of the commit message**: one blank line after the body, then contiguous `Key: value` lines with no blank lines between them.
2. The value must be `Name <email>`. A bare name has no effect.
3. The email must be bound to a GitHub account to show an avatar and a link. An unbound email still displays the name but creates no account association.
4. Trailer keys are case-insensitive: `Co-Authored-By` and `Co-authored-by` are equivalent.

The safest email form is `<login>@users.noreply.github.com`, which is inherently bound to the account with that login. Vendor-domain emails (such as `noreply@pi.dev`) also work, provided the email is registered on the corresponding account — this must be observed, never assumed.

## How to verify that an email links

Do not fill the registry by guessing. Two empirical checks:

1. **Contributors**: after pushing a few commits with the trailer, does the account appear in the repository's Contributors section?
2. **Commit page**: does the co-author's name on the commit detail page carry a link and an avatar?

The `linked` field in `references/agents.json` records exactly this conclusion:

- `verified` — observed in a real repository
- `documented` — an official doc or community test record exists, but not verified locally
- `inferred` — guessed from the vendor domain, unproven

## Common mistakes

| Spelling | Problem |
| --- | --- |
| `Co-authored-by: ZCode` | No email; GitHub does not parse it |
| `Co-authored-by: ZCode <agent@zcode>` | Email has no domain; malformed |
| `Co-authored-by: Trae (GLM-4.6) <...>` | Model name inside the human name; GitHub displays it literally as a name |
| One agent, many spellings | Fragmented contributor stats that cannot be merged |
| No blank line before the trailer | Treated as body text; not parsed |

## Where the model name goes

Keep model names out of the `Co-authored-by` name; carry them in `Assisted-by`:

```text
Co-authored-by: Trae <trae-agent@users.noreply.github.com>
Assisted-by: Trae Agent:GLM-4.6
```

The `Host:model` form is recommended for `Assisted-by`: machine-parseable, and easy to aggregate by model later.

## Squash merges

Do not assume trailers from source-branch commits survive a squash merge. Treat the `Co-authored-by` lines written explicitly in the PR description as authoritative, and confirm on the commit page after merging.

## Community conventions

This skill's format choices follow established practice, not invention:

- **`Co-authored-by: Name <email>`** is GitHub's documented multi-author mechanism and the de facto standard across coding agents.
- **`Assisted-by: Agent:model`** is mandated by OpenSSL's CONTRIBUTING for AI-assisted contributions, with the explicit rule that disclosure does not transfer responsibility. Multiple tools mean multiple `Assisted-by` lines.
- **The Linux kernel uses a different system**: `Co-developed-by:` must be immediately followed by the co-author's own `Signed-off-by:` (a DCO chain), and AI agents must never add `Signed-off-by` — only humans can certify the DCO. That is a legal sign-off process for patch submission, not GitHub attribution; do not mix the two.
- **Copilot has more than one identity**: Copilot CLI/App write `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`, while older GitHub Copilot commits use `<copilot@github.com>`. The autonomous coding agent instead commits as a fixed bot *author* (committer `copilot-swe-agent[bot]`); that is author metadata, distinct from the trailer identity.

### Vendor default vs community convention

Registry entries distinguish two origins:

- **Vendor default** — the tool itself writes the trailer (Claude Code's `attribution.commit`, Codex's `commit_attribution`, aider's hardcoded `aider@aider.chat` in `aider/repo.py`). The vendor doc or source file is the authoritative source.
- **Community convention** — the tool writes nothing, and repositories converged on an identity via hooks and AGENTS.md (e.g. `noreply@opencode.ai`; OpenCode's source contains no co-author trailer). Such emails are unproven for account linkage until observed in a real Contributors list.

Sources must be checkable: an official doc page, a vendor source file, or a concrete community example — never a bare "seen somewhere". The community project [Cirnouo/ai-commit-attribution](https://github.com/Cirnouo/ai-commit-attribution) maintains a similar registry with per-entry official sources and schema tests; its evidence discipline is a useful reference.

## Hosts that write no trailer

Some agents can commit but never add attribution, so a registry entry would be a guess. Record them here instead of researching the same host twice:

| Host | What it writes | Evidence |
| --- | --- | --- |
| Gemini CLI | No co-author trailer. The registry's `noreply@google.com` alias records a community convention, not a vendor default. | No trailer in its source (https://github.com/google-gemini/gemini-cli); community audits reached the same conclusion. |
| Zed (native agent) | No co-author trailer; it generates commit messages. External agents run over ACP (Claude Code, Codex, Gemini CLI) and bring their own identities. | https://zed.dev/docs/ai/agent-panel and https://zed.dev/blog/bring-your-own-agent-to-zed |
| Google Antigravity | No attribution trailer documented for commits made from the Review pane. | https://antigravity.google/docs/review-changes |
| iFlow CLI | Writes `Co-developed-by: iFlow <noreply@iflow.cn>`, not `Co-authored-by`; GitHub ignores it for attribution. | https://github.com/aliyun/alibabacloud-devops-mcp-server/commit/ab288ea611a81de905243279921490049e451ee9 |

Absence of evidence is not proof: a host can add attribution in a later release. Re-check its docs or a few real commits before adding an entry, and update this table when one starts signing.

A weak sighting is not an identity. Warp commits have been seen with `Co-authored-by: auto <noreply@warp.dev>`, but the display name is generic and the sample is tiny, so there is no stable identity to normalize and no entry. See https://api.github.com/search/commits?q=%22noreply%40warp.dev%22.

## Keeping the registry current

- Prefer `check --range` on real repositories over vendor lists: it shows the identities collaborators actually use, and every `unknown-agent` warning is a candidate.
- Add one entry per product, with aliases and patterns for model-name and spelling variants. Do not add an entry per model.
- Only add a `Name <email>` that a vendor source or a real commit shows. Leave the rest to the `unknown-agent` warning.
- Re-verify the account link before promoting an entry from `documented` or `inferred` to `verified`.
