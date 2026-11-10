# Pre-release acceptance record

Date: 2026-11-11 (Asia/Shanghai)
Implementation commit: `b0aef8d8abcce2a6e83a473155b8cdf5597ef893`
Validation updates: `5cbe365`, `e4f32ff`, `5ea5c22`, and the final documentation update recorded here

## Automated checks

- `npm run check`: passed (typecheck, 25 tests, build), including a clean-checkout simulation with the ignored `dist/` directory removed so CLI tests no longer depend on a previous local build.
- Test discovery uses explicit test file arguments. Node 20's test runner did not resolve `tests/**/*.test.ts` on GitHub Actions; the explicit list is stable across the Node 20/22/24 CI matrix.
- CI uses a per-ref concurrency group so rapid pushes cancel stale runs instead of producing misleading cancelled jobs.
- GitHub Actions run `42869337733` passed on Node.js 20, 22, and 24: `npm ci`, `npm run check`, and `npm pack --dry-run` were successful in all three jobs.
- Check coverage includes duplicates, shadowing, stale MCP commands, duplicate MCP entries, missing references, structured risky declarations, deterministic instruction overlap, and the low-confidence unused-capability hint.
- Fix coverage includes TOML MCP disabling, JSON MCP disabling, Skill directory disabling, apply/undo, concurrent modification refusal, transaction history/show, and removal of disabled-directory residue after undo. The JSON MCP test asserts that unrelated settings remain intact through apply and undo.
- A copied shape of the current user's real `~/.codex/config.toml` was scanned, fixed, and undone in a temporary fixture. The source file was read only and was not modified. In CI and other environments without that file, the test writes a synthetic TOML MCP config as a fallback so the same transaction still exercises the full scan/fix/undo flow.
- CLI-level `fix --json` → `apply --json` → `undo --json` applies a reversible transaction and keeps original config bytes intact. The JSON plan/transaction/history outputs omit Base64 file bytes, pending plans, and backup paths.
- `npm audit --omit=dev`: 0 production vulnerabilities.
- `npm pack --dry-run`: 30 files, 45.8 kB tarball; only `dist`, `README.md`, `LICENSE`, and `package.json` are published.
- Clean-install smoke test from the packed tarball in a temporary consumer directory: `agent-tidy version` returned `0.1.0`; isolated `scan --json --no-report` returned 0 findings and 2 hosts.
- Local global-install smoke test through `npm install -g . --prefix <temp>`: `agent-tidy version` and `agent-tidy --help` worked; `npm uninstall -g agent-tidy --prefix <temp>` removed the linked binary.
- `--no-report` was verified not to create `latest-report.html` in an isolated data directory.

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

## Install, uninstall, and local data

For a checkout:

```bash
npm install
npm run check
npm link
agent-tidy scan
```

To remove the linked command, run `npm unlink -g agent-tidy` from another directory. For a packaged install, use `npm install -g <tarball-or-package>` and remove it with `npm uninstall -g agent-tidy`. `agent-tidy` does not create files inside Git repositories it scans; local reports, pending plans, and transaction snapshots are stored under `~/.local/share/agent-tidy` by default or under `--data-dir`. After `undo` and a final visual review, that directory can be removed with `rm -rf ~/.local/share/agent-tidy` if the user wants no retained local data. Removal of the tool does not automatically delete those files.

This is a repeatable, synthetic-fixture install/uninstall and retention procedure. It does not replace the pending second real personal setup validation.

## Remaining publication gates

The first public version is not yet declared ready for npm publication or a GitHub release. CI, install/uninstall, and data-retention gates are recorded above; remaining gates from [ROADMAP.md](../ROADMAP.md) require a second real personal setup and an explicitly approved real fix/undo:

- validate the fix flow on a second real personal setup, with explicit user awareness and read-only output until a fix is deliberately requested;
- demonstrate `undo` from a real, user-approved fix (not just fixtures);
- decide whether `agent-tidy@0.1.0` should be published under the user's npm account.

This record describes validation performed so far; it does not claim that a configuration is safe, trusted, or free of semantic conflicts.
