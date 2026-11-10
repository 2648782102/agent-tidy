# Pre-release acceptance record

Date: 2026-11-11 (Asia/Shanghai)
Implementation commit: `b0aef8d8abcce2a6e83a473155b8cdf5597ef893`
Validation updates: `5cbe365` and later working-tree changes recorded here

## Automated checks

- `npm run check`: passed (typecheck, 23 tests, build), including a clean-checkout simulation with the ignored `dist/` directory removed so CLI tests no longer depend on a previous local build.
- Check coverage includes duplicates, shadowing, stale MCP commands, duplicate MCP entries, missing references, structured risky declarations, deterministic instruction overlap, and the low-confidence unused-capability hint.
- Fix coverage includes TOML MCP disabling, JSON MCP disabling, Skill directory disabling, apply/undo, concurrent modification refusal, transaction history/show, and removal of disabled-directory residue after undo.
- A copied shape of the current user's real `~/.codex/config.toml` was scanned, fixed, and undone in a temporary fixture. The source file was read only and was not modified.
- `npm audit --omit=dev`: 0 production vulnerabilities.
- `npm pack --dry-run`: 30 files, 45.6 kB tarball; only `dist`, `README.md`, `LICENSE`, and `package.json` are published.
- Clean-install smoke test from the packed tarball in a temporary consumer directory: `agent-tidy version` returned `0.1.0`; isolated `scan --json --no-report` returned 0 findings and 2 hosts.
- Local global-install smoke test through `npm install -g . --prefix <temp>`: `agent-tidy version` and `agent-tidy --help` worked.

## Real personal setup smoke test

A read-only scan was run against the current user's Codex configuration with the default paths. After tightening capability detection to structured declarations, the result was:

```text
OK：已检查 4 个路径 · 2 个 host · 没有发现高置信、可操作的问题
报告：~/.local/share/agent-tidy/latest-report.html
```

No fix was applied to the real configuration. The HTML report was written locally only. JSON mode intentionally omits `reportPath` because no report is written in that mode.

## End-to-end fixture workflow

A temporary fixture with one stale MCP command and two duplicate Skills was used to run:

```text
scan
fix all
diff
apply --yes all
history
undo <transaction>
add <local-source>
```

Verified outcomes:

- `fix all` selected 3 fixes but deduplicated them into 2 path changes, disabling one duplicate Skill copy instead of both.
- `apply` changed `[mcp_servers.broken]` to `[disabled.mcp_servers.broken]` and renamed one Skill directory.
- `undo` restored the original config bytes and both original Skill directory names, with no `.agent-tidy-disabled` residue.
- `add` detected a duplicate Skill name and structured shell declarations without executing the source.
- A concurrent modification between plan creation and apply was rejected by re-hash verification in the automated suite.

## Remaining publication gates

The first public version is not yet declared ready for npm publication or a GitHub release. Remaining gates from [ROADMAP.md](../ROADMAP.md):

- validate the fix flow on a second real personal setup, with explicit user awareness and read-only output until a fix is deliberately requested;
- demonstrate `undo` from a real, user-approved fix (not just fixtures);
- record a repeatable clean-install/uninstall and data-retention note;
- verify the pushed GitHub Actions run on Node.js 20, 22, and 24 (the first run exposed clean-checkout CLI test failure; local validation now covers the fix);
- decide whether `agent-tidy@0.1.0` should be published under the user's npm account.

This record describes validation performed so far; it does not claim that a configuration is safe, trusted, or free of semantic conflicts.
