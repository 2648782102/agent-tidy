# Decision log

## 2026-11-11 — TypeScript CLI with a small TOML parser

- Context: the repository began as a planning-only project and needed a local, testable implementation without an MCP server, daemon, or model dependency.
- Choice: TypeScript on Node.js 20+, ESM, `smol-toml` as the only runtime dependency; tests use the built-in Node test runner through `tsx`.
- Alternatives: Python CLI, Go binary, Rust binary, a TUI framework, or a compiled standalone executable.
- Consequences: easy npm installation and reviewable code; a Node runtime is required; native binary packaging is deferred until transaction safety has more real-world validation.

## 2026-11-11 — Explicit host adapters, no home-directory crawl

- Context: host configuration includes user scope, project scope, plugin caches, Skills, MCP entries, hooks, and instruction files. A full filesystem scan would be slow and privacy-sensitive.
- Choice: adapters inspect a bounded list of documented paths and record unsupported files instead of guessing.
- Alternatives: generic recursive discovery or reading host runtime state through commands.
- Consequences: predictable and auditable, but new host versions require adapter updates; unsupported paths are reported, not inferred.

## 2026-11-11 — Text-preserving config patches

- Context: rewriting a whole `config.toml` or `settings.json` can reorder keys, drop comments, and change formatting.
- Choice: TOML fixes rename only a known header to `[disabled.*]`; JSON fixes add a `disabled` field using JSON serialization; Skill fixes rename a directory.
- Alternatives: full TOML/JSON round-trip rewrite or deleting entries.
- Consequences: lower diff noise and easier review; JSON formatting may still normalize, so every fix requires a preview and is reversible.

## 2026-11-11 — High-confidence findings over broad advisory output

- Context: the previous Proofpack experiment showed that a static report users must find and interpret has weak practical value.
- Choice: default output is a compact terminal list; clean setups print one OK line; an HTML report is a secondary artifact; speculative semantic advice is not shown by default.
- Alternatives: a dashboard, score, long Markdown report, or model-based audit.
- Consequences: fewer findings and a clearer action path; the tool cannot claim a configuration is globally “safe”.

## 2026-11-11 — Local transaction store, not Git

- Context: the tool must work outside a Git repository and must restore exact bytes and permissions.
- Choice: transactions live under a local application data directory with original snapshots and a manifest; `undo` reads that manifest.
- Alternatives: Git stash/commit, filesystem snapshots, or a database.
- Consequences: no Git dependency and precise file-level undo; transaction data is local sensitive state that users must not share.

## 2026-11-11 — Optional host integration remains out of the first public version

- Context: Phase 4 proposed an opt-in hook or host summary.
- Choice: ship CLI/TUI, compact output, an HTML report path, and JSON output first; do not install hooks or require host-specific UI integration.
- Alternatives: MCP server, Codex plugin, or automatic hook installation.
- Consequences: less magic and a smaller trust surface; users must run `agent-tidy` themselves until integration is independently validated.

## 2026-11-11 — JSON mode is equivalent, explicit, and byte-safe

- Context: agents and scripts need a non-interactive flow, while JSON output is easy to copy into logs and terminal scrollback.
- Choice: `fix --json` creates a pending plan, `apply --json` applies it without an interactive prompt, and `undo --json` restores it; plan, transaction, history, and undo JSON omit Base64 configuration bytes, backup paths, and snapshots.
- Alternatives: keep JSON as preview-only, require a TTY for apply, or serialize full transaction records.
- Consequences: scripted use is deterministic and does not silently write during preview; an explicit `apply` command remains the user's authorization boundary, and configuration contents stay in local transaction files rather than JSON output.
