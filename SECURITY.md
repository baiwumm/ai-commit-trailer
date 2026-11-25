# Security Policy

## Scope

`ai-commit-trailer` is a local Node.js CLI and agent skill. It reads commit
messages, invokes local `git`, and can rewrite a message file with
`fix --write`. It has no server, no network calls, no accounts, and no
credentials.

Security-relevant surfaces:

- Parsing untrusted commit messages, including trailer names and email
  addresses.
- `fix --write`, which writes only the file passed with `--message`.
- `check --range`, which passes the revision range to `git log` as an argument,
  without a shell.

Attribution-policy disagreements, incorrect registry entries, and GitHub
rendering behavior are normal issues, not vulnerabilities.

## Reporting a vulnerability

Do not open a public issue or pull request. Use GitHub private vulnerability
reporting:

https://github.com/baiwumm/ai-commit-trailer/security/advisories/new

Include the affected commit or version, Node and git versions, reproduction
steps, and expected impact. Use synthetic data and redact credentials or
private repository content.

This is a single-maintainer project, so response is best effort. Please allow
time for a fix before public disclosure.

## Supported versions

Security fixes target the latest released version. Older tags are not
backported.
