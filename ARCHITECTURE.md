# Architecture

Status: proposed architecture for the planning stage. No runtime code exists yet.

## Shape

`agent-tidy` is a local CLI with a thin terminal UI. It is not an MCP server, plugin, daemon, or cloud application. MCP config is data to inspect, not the product's distribution shape.

```text
CLI / TUI
  ├── scan command
  │     └── discovery → checks → findings
  ├── explain command
  │     └── discovery → one item's source chain
  ├── apply flow
  │     └── selected fixes → plan → preview → transaction
  ├── undo command
  │     └── transaction store → restore
  └── add preflight (P1)
        └── source reader → local inventory comparison
```

## Core modules

### Host adapters

A host adapter is a version-aware, read-only description of:

- user/global config locations;
- project config locations;
- Skill directories and precedence;
- MCP server fields;
- hook and plugin manifests;
- instruction files and scope;
- unsupported or ambiguous versions.

Adapters must never infer a path by scanning the whole home directory. They return explicit discovered paths with a source label.

Proposed first adapters:

- `codex`: Codex CLI / Codex desktop local configuration.
- `claude-code`: Claude Code user/project Skills, settings, plugins, MCP entries, hooks, and instruction files.

### Inventory

The inventory is an in-memory, normalized list of:

- `SkillRecord`: id, name, description, path, scope, source field, declared capabilities, content hash;
- `McpRecord`: name, command, args, environment keys (names only), scope, source path, duplicate key;
- `HookRecord`: event, command/path, scope, source path;
- `PluginRecord`: id, source, enabled state, scope, version, declared paths;
- `InstructionRecord`: path, scope, source chain, deterministic rule markers;
- `UnsupportedRecord`: path or host version that was found but not interpreted.

Secrets and environment values are never stored in the inventory. Only key names and redacted diagnostics are allowed.

### Checks

A check is a pure function from inventory to zero or more findings:

```text
CheckContext → Finding[]
```

Every finding includes:

```text
id, checkId, title, evidence[], confidence, severity,
affectedPaths[], sourceScopes[], availableFixes[], limitations[]
```

Checks do not read arbitrary files directly, call models, make network requests, or mutate configuration.

### Fix planner

The planner converts selected `Finding`s and chosen `availableFixes` into an ordered `ChangePlan`:

```text
ChangePlan → Change[]
Change → { path, operation, beforeHash, afterBytes, rationale, findingId }
```

Supported P0 operations are limited to:

- add an explicit disabled marker in a supported config format;
- rename a duplicate Skill directory or file within its existing scope;
- replace a known config entry with an equivalent disabled entry;
- restore from a transaction during `undo`.

Unsupported fixes are rejected before any write.

### Transaction store

Transactions live under a local application data directory, not inside an arbitrary Git repository. Each transaction stores:

- original file bytes, permissions, symlink status, and content hash;
- planned and applied changes;
- host adapter versions and tool version;
- timestamp, outcome, and redacted diagnostics;
- enough state to restore after a partial write failure.

Transactions may contain sensitive configuration. They are local-only, excluded from sharing, and never committed to this repository or uploaded.

### Terminal UI

The default view is a compact selection list:

```text
3 actionable findings · 2 hosts · 41 paths inspected

[ ] duplicate-skill  human-writing appears in two active scopes
[ ] stale-mcp        proofpack-mcp command is no longer resolvable
[ ] risky-hook       one hook declares broad shell access

Enter: preview    x: select    ?: explain    q: quit
```

The UI is optional. `scan`, `diff`, `show`, and `undo` must work in non-interactive contexts.

## Data flow

1. Resolve the requested host adapter versions.
2. Read only documented config paths and bounded Skill directories.
3. Build a normalized inventory and a list of unsupported items.
4. Run deterministic checks.
5. Deduplicate and sort findings by confidence, impact, and reversibility.
6. If no interactive action is requested, print the compact result and exit.
7. For an apply flow, build a `ChangePlan`, show a preview, and require explicit confirmation.
8. Re-hash every target immediately before writing.
9. Write changes through a transaction with rollback on failure.
10. Print the transaction ID and exact `undo` command.

## Security and privacy model

- Discovery is local and read-only.
- No Skill, MCP command, hook, or plugin is executed during discovery.
- Remote includes, package installation scripts, and unknown executable resolution are not performed.
- Config values that look like secrets are never printed; only field names and bounded, redacted evidence are shown.
- Fix previews are generated locally and are not uploaded.
- Transaction logs can contain configuration; they require local filesystem permissions and a documented retention/cleanup design.
- The tool does not weaken host permissions or automatically approve a risky capability.

## Technology choices

To be decided in Phase 0 after verifying the host adapters. Current constraints:

- a single installable binary or a minimal Node/TypeScript CLI;
- no runtime model SDK;
- no database server;
- no mandatory Git dependency;
- no background process for P0;
- a small, testable TUI library or a plain prompt-based fallback.

The implementation language is deliberately left open until the config formats, release channel, and local test setup are validated.

## Test strategy

- Unit tests for every adapter using synthetic config directories.
- Fixture-based tests for duplicate, shadowing, stale path, risky declaration, and instruction overlap checks.
- Property-style tests for inventory normalization and redaction.
- Transaction tests covering success, partial write failure, concurrent modification, symlink, permission, and undo.
- Non-TTY smoke tests for `scan`, `diff`, `show`, and `undo`.
- Manual acceptance against a real personal setup with networking disabled.
- No test may require a real API key, account, network service, or mutation of the user's actual home directory.

## Future extension points

- Additional host adapters behind a stable `HostAdapter` interface.
- `add` preflight for local directories and pinned GitHub refs.
- A host hook that surfaces only newly introduced high-confidence risks.
- A/B "Skill trial" runner as a separate product decision, not part of the P0 architecture.
