# Roadmap and delivery plan

Status: implementation in progress. Dates are relative milestones, not commitments.

## Current checkpoint (2026-11-11)

- Phase 0 complete: adapter paths, official sources, implementation language, fixture strategy, and decision log are documented.
- Phase 1 complete in code: read-only `scan`, `explain`, compact terminal output, JSON output, HTML report, deterministic checks, fixture tests, and a read-only real-home smoke scan.
- Phase 2 complete in code: `fix`, `apply`, `diff`, `history`, `show`, and `undo` with snapshots, re-hash refusal, rollback, and tests.
- Phase 3 complete in code for local sources: `add <local-dir>` preflight compares names/MCP entries and reports structured risks without executing installers. Pinned GitHub sources are explicitly deferred to a later decision.
- Phase 4 remains intentionally out of scope for the first public version.

Publishing is gated by a second real personal setup validation, an explicitly approved real fix/undo demonstration, and release notes. Clean-install, global-install, and fixture transaction smoke tests are already recorded in [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md). The current CLI is usable locally but is not yet published as an npm package or GitHub release.

## Decision gates

Each phase ends with an explicit stop/continue decision. A phase is complete only when its exit criteria are met; adding more documentation or features does not count.

## Phase 0 — feasibility and host truth

Goal: prove that the product can honestly explain one real personal setup.

Work:

- Inspect current Codex and Claude Code config locations on macOS.
- Record exact precedence rules, config file schemas, Skill directories, MCP fields, hooks, plugin manifests, and instruction scopes.
- Identify which locations are user-global, project-local, managed, generated, or version-dependent.
- Choose the implementation language and CLI/TUI stack.
- Create a local fixture that resembles the real setup without copying secrets.
- Decide the minimum supported host-version matrix.

Exit criteria:

- A written adapter contract for at least Codex and Claude Code.
- At least three real, non-sensitive examples of discoverable items.
- A clear list of paths that P0 will deliberately not inspect.
- A confirmed way to detect host-version drift.

Stop condition: if config precedence cannot be determined reliably enough for high-confidence findings, narrow the product to an inventory/explain tool with no automatic fixes.

## Phase 1 — read-only MVP

Goal: `agent-tidy scan` and `agent-tidy explain` work against fixtures and the developer's real setup.

Work:

- Implement host adapters, inventory, and redaction.
- Implement P0 checks: duplicate, shadowing, stale path, stale MCP command, duplicate MCP, risky declaration, and deterministic instruction overlap.
- Implement compact terminal output and non-TTY output.
- Add unit and fixture tests.
- Add an explicit unsupported/limitations section.
- Manually validate with networking disabled.

Exit criteria:

- No file is written during `scan` or `explain`.
- Every finding has evidence, affected path, confidence, and a named check.
- A clean fixture produces a one-line result.
- At least one real, previously unknown actionable finding appears on a personal setup.
- All tests pass without network access or credentials.

Stop condition: if real findings are mostly speculative or noisy, do not build the fix flow.

## Phase 2 — reversible fixes

Goal: a user can fix selected findings and undo them safely.

Work:

- Implement fix planner, preview, diff, confirmation, and transaction store.
- Implement `undo`, `history`, and `show`.
- Add refusal on concurrent target modification and rollback on partial failure.
- Add tests for atomicity, permissions, symlinks, and interrupted writes.
- Manually validate host-visible behavior before and after a fix.

Exit criteria:

- A chosen fix changes a supported host's active inventory.
- `undo` restores exact bytes and permissions.
- A failed write leaves no partial change.
- No P0 fix deletes a user file.
- The flow works outside a Git repository.

## Phase 3 — installation preflight

Goal: `agent-tidy add <source>` warns before a user adds another overlapping capability.

Work:

- Read a local directory without executing install scripts; a pinned GitHub source is not part of the first version.
- Compare name/ID, declared capabilities, and MCP commands with the active inventory.
- Produce a short conflict/risk preview.
- Keep installation outside `agent-tidy` for this phase.

Exit criteria:

- A duplicate or risky source is detected before install.
- No source code is executed and no network content is trusted as instructions.
- Unknown source shapes fail closed with a clear reason.

## Phase 4 — optional host integration

Goal: reduce the chance that the user forgets to run the tool, without becoming a daemon.

Work to evaluate:

- An opt-in hook that reports only newly introduced high-confidence risks.
- A compact summary available inside a supported host.
- A stable machine-readable output for scripts and CI.
- Documentation for privacy and retention.

Exit criteria:

- The integration is opt-in, local, and removable.
- It does not silently change configuration.
- It does not require an MCP server, account, or network service.

## Explicitly out of scope

- Star growth campaigns, directory submissions, or launch posts before Phase 2 validation.
- Publishing a package or release before transaction safety is proven.
- A semantic Skill quality score or LLM judge.
- A universal installer for every agent host.
- Team dashboards, shared policy, cloud sync, telemetry, or billing.
- Automatic deletion, automatic trust decisions, or automatic installation.

## Definition of done for the first public version

A first public version is ready only when:

- Phase 1 and Phase 2 exit criteria are met on two real personal setups, including a real fix/undo approved by the user;
- README explains the product in one screen;
- install/uninstall is documented;
- every check and fix has tests;
- security and privacy limits are documented;
- `undo` has been demonstrated from a real fix;
- the project can be used without Git, network, an account, or a model API.
