# Development workflow

Current status: pre-release TypeScript CLI. The source tree, package manifest, tests, and CI workflow exist.

## Working agreement

- Keep the first implementation small enough for one person to understand.
- Treat host configuration as user data: read carefully, write rarely, restore reliably.
- Do not add a model call, MCP server, daemon, telemetry, or cloud dependency to solve a local problem.
- Every new check must have a deterministic fixture and a documented false-positive limit.
- Every new fix must be reversible and covered by an undo test.
- Never commit real personal configuration, secrets, transaction logs, or session histories.
- Re-check host documentation when a Codex or Claude Code release changes config paths or precedence.

## Repository layout

```text
src/
  cli.ts        command parsing, terminal output, and optional prompt
  adapters/     host-specific config discovery and TOML block handling
  checks.ts     deterministic checks and fix descriptors
  fixes.ts      change planning, preview, backup, apply, rollback, and undo
  add-preflight.ts  local-source installation preflight
  report.ts     local HTML report rendering
  types.ts      normalized inventory and transaction types
  util.ts       redaction, hashing, atomic writes, and capability detection
tests/
  helpers.ts    synthetic host roots and fixture helpers
  *.test.ts     adapter, check, fix, CLI, and transaction tests
docs/
  ADAPTERS.md   host-specific path and precedence notes
  DECISIONS.md  architecture decisions
  ACCEPTANCE.md validation and release-gate record
```

## Local validation principles

- Use a temporary home directory or explicit fixture root for every test.
- Never mutate the developer's real configuration from an automated test.
- Network access is not required and should be disabled for acceptance checks.
- Manual validation may read real config only with explicit user awareness and redacted output.
- A test must not execute a Skill, MCP command, hook, plugin, or installer.

## Local commands

```text
npm install
npm run typecheck
npm test
npm run build
npm run check
npm link
agent-tidy scan --home /tmp/fixture/home --cwd /tmp/fixture/project --data-dir /tmp/fixture/data
```

`npm run check` runs type checking, all tests, and the build. A GitHub Actions workflow runs the same checks on Node.js 20, 22, and 24.

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

A future npm/GitHub release must include:

- supported host versions and platforms;
- exact config paths inspected;
- a clean-install smoke test;
- an uninstall and data-retention note;
- a reproducible build process;
- known limits in release notes.

Phase 2 transaction safety and Phase 3 local-source preflight are implemented and covered by automated tests. Clean-install, global-install, second real setup, and real fix/undo validation are recorded in [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md). Publication remains intentionally deferred until the user explicitly decides to publish under their npm account.

## Decision log

Significant product and architecture decisions are recorded in [docs/DECISIONS.md](docs/DECISIONS.md). Keep each decision short: context, choice, alternatives, consequences, and date.
