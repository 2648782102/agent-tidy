# Security and privacy

`agent-tidy` reads local coding-agent configuration. It is designed for one person’s machine, not for shared or hosted analysis.

## What the tool reads

- Codex: `~/.codex/config.toml`, `<cwd>/.codex/config.toml`, `~/.codex/skills`, `<cwd>/.codex/skills`, `.codex-plugin/plugin.json` under `~/.codex/plugins/cache`, `AGENTS.md`.
- Claude Code: `~/.claude/settings.json`, `~/.claude/settings.local.json`, `<cwd>/.claude/settings.json`, `<cwd>/.claude/settings.local.json`, `~/.claude.json`, `<cwd>/.mcp.json`, user/project `skills/`, `CLAUDE.md`, and `CLAUDE.local.md`.
- Paths can be overridden with `--home`, `--cwd`, `--codex-home`, `--claude-home`, and `--data-dir` for tests and fixtures.

The tool does not crawl the whole home directory. It does not read browser history, credentials stores, session transcripts, or arbitrary files referenced by remote includes.

## What the tool does not do

- It never executes a discovered Skill, MCP server command, hook, plugin, or installer.
- It never makes a model API call or telemetry request.
- It never uploads configuration, findings, reports, or transactions.
- It never automatically disables a capability during `scan`, `explain`, `add`, `diff`, or `hosts`.
- It never deletes a user file during a fix. P0 fixes write a disabled marker or rename a Skill directory to `.agent-tidy-disabled`.
- It does not weaken host permission settings or approve a capability.

## Redaction

Environment values are not stored in the inventory. Only environment key names are recorded. Output, reports, transaction outcomes, and diagnostics apply redaction for common bearer tokens, API-key-like strings, and assignment-shaped secrets. A finding can still contain file paths, commands, and bounded evidence from local configuration.

Treat terminal output and HTML reports as local sensitive artifacts. Do not paste them into public issues without review.

## Transactions

Applying fixes creates a local transaction under `~/.local/share/agent-tidy/transactions/` by default, or under `--data-dir`. It stores:

- original file bytes, permissions, and symlink targets where applicable;
- directory backups for renamed Skill directories;
- planned changes and a compact manifest;
- adapter versions, tool version, timestamp, status, and outcome.

Transactions can contain configuration content and must not be committed, synced, or shared. Use `agent-tidy history`, `agent-tidy show`, and `agent-tidy undo` for local management.

## Concurrency and rollback

Before every write, `agent-tidy` re-hashes each target and refuses to continue if it changed after the scan. If a write fails, already applied paths are restored from snapshots. `agent-tidy undo` restores bytes and permissions recorded in the transaction.

`undo` cannot reverse side effects performed earlier by an external Skill, MCP server, hook, or plugin. It also cannot restore files that were changed by another process after the transaction was applied.

## Reporting a vulnerability

Open a GitHub issue with a minimal synthetic fixture. Do not attach real `config.toml`, `settings.json`, credentials, transcripts, or transaction manifests.
