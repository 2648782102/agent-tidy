# Development workflow

Current status: planning repository. There is no source tree or package manifest yet.

## Working agreement

- Keep the first implementation small enough for one person to understand.
- Treat host configuration as user data: read carefully, write rarely, restore reliably.
- Do not add a model call, MCP server, daemon, telemetry, or cloud dependency to solve a local problem.
- Every new check must have a deterministic fixture and a documented false-positive limit.
- Every new fix must be reversible and covered by an undo test.
- Never commit real personal configuration, secrets, transaction logs, or session histories.
- Re-check host documentation when a Codex or Claude Code release changes config paths or precedence.

## Suggested repository layout

The layout below is a proposal for Phase 1, not yet created:

```text
src/
  cli/          command parsing and terminal output
  adapters/     host-specific config discovery
  inventory/    normalized records and redaction
  checks/       pure deterministic checks
  fixes/        change planning and preview
  transactions/ backup, apply, rollback, undo
  tui/          optional interactive view
tests/
  fixtures/     synthetic host configs and Skills
  unit/
  integration/
docs/
  adapters/     host-specific path and precedence notes
```

## Local validation principles

- Use a temporary home directory or explicit fixture root for every test.
- Never mutate the developer's real configuration from an automated test.
- Network access is not required and should be disabled for acceptance checks.
- Manual validation may read real config only with explicit user awareness and redacted output.
- A test must not execute a Skill, MCP command, hook, plugin, or installer.

## Commands to define in Phase 0

The implementation will add commands equivalent to:

```text
install dependencies
run type checking
run unit tests
run integration tests
run all checks
build a local binary
```

Exact commands will depend on the selected language and package manager. They must be documented here before source code is added.

## Definition of a reviewable change

A pull request or local change should include:

- the user-visible problem;
- affected host adapter and config version;
- new or updated fixture;
- tests for the finding and any fix;
- false-positive and false-negative notes;
- privacy impact;
- undo behavior when a write path changes.

## Release policy

No release is planned until Phase 2 is complete. A future release must include:

- supported host versions and platforms;
- exact config paths inspected;
- a clean-install smoke test;
- an uninstall and data-retention note;
- a reproducible build process;
- known limits in release notes.

## Decision log

Record significant product or architecture decisions in `docs/decisions/` when implementation starts. Keep each decision short: context, choice, alternatives, consequences, and date.
