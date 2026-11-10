# Product requirements

## Primary user

An individual developer using one or two coding agents on a personal Mac or Linux machine. They install Skills and MCP servers occasionally, but do not want to maintain a second platform just to understand their own configuration.

## Core job

When a coding agent behaves unexpectedly, or before adding another capability, the user wants to know: **what is active, what is broken, what overlaps, and what can I safely change?**

`agent-tidy` is successful when the user can answer that in one short interaction and leave their configuration either unchanged or deliberately, reversibly changed.

## User stories

1. As a user, I run one command and see only issues that I can act on.
2. As a user, I can ask why a particular Skill is active and which file made it active.
3. As a user, I can disable a duplicated or stale capability without knowing the host's config format.
4. As a user, I see the exact diff before a fix and can cancel without side effects.
5. As a user, I can restore the previous configuration after any fix.
6. As a user, I can preflight a Skill or plugin source before installing it.
7. As a user, I am told which paths and host versions were not inspected.
8. As a user, I am not asked to create an account, connect a cloud service, run a daemon, or invoke a model.

## Experience rules

- Default output is a compact terminal list. No Markdown report is required for the main flow.
- Findings are ordered by confidence and reversibility, not by technical category.
- Each finding must show: ID, short title, affected path, why it matters, and available action.
- The tool never uses phrases such as "safe to merge", "verified correct", or "trusted" for a whole configuration.
- A clean scan is one line: what was inspected, and that no actionable findings were discovered.
- Unknown or unsupported config is listed separately from findings.
- The interactive fix list is optional: `scan` remains fully non-interactive and read-only.
- Color, icons, and animations are never required to understand a result.

## Functional requirements

### P0: discovery

- Discover supported host config locations with explicit, version-aware adapters.
- Discover installed local Skills from known global and project directories.
- Read MCP server entries, hooks, and plugin manifests from known config paths.
- Read active instruction files and their scope.
- Record a bounded inventory of paths, hashes, and source scopes in memory for one run.
- Never follow arbitrary remote includes or execute discovered commands during discovery.

### P0: checks

- Detect exact duplicate names/IDs and identical content copied into multiple active scopes.
- Detect shadowing where a nearer scope wins over another active copy.
- Detect missing local paths and unresolvable executables without running them.
- Detect duplicate MCP server identities across active scopes.
- Detect declared capabilities that match a documented risk pattern.
- Detect deterministic instruction conflicts from a small, explicit rule set.
- Label every finding with confidence, check ID, source path, and evidence.

### P0: explanation

- `explain <id>` reconstructs the discovery chain for one item.
- It shows which adapter, scope, file, and field made the item active.
- It names any item that overrides or is overridden by the selected item.

### P0: fix and undo

- Fixes are grouped into one transaction per confirmed run.
- The transaction is atomic at the file level: if one write fails, already written files are restored.
- A stable manifest records original bytes, permissions, and symlink status where applicable.
- `undo` restores the latest transaction by default and supports an explicit transaction ID.
- No fix deletes files in P0.
- No fix edits a file whose hash changed after the scan.

### P1: preflight

- `add <local-dir>` resolves a local directory without executing install scripts.
- It compares names, IDs, and declared capabilities against the active inventory.
- It reports conflicts and risky declarations before installation.
- It does not install anything in the first version of this feature.
- Pinned GitHub sources are explicitly deferred; no network fetch or remote source execution is part of the first version.

### P1: change history

- `history` lists local fix transactions with timestamps and summaries.
- `show <transaction>` displays the recorded diff without applying anything.
- History stays on the local machine and is never uploaded.

## Non-functional requirements

- Startup should feel immediate: no model call, package installation, network request, or full filesystem crawl by default.
- Discovery paths are bounded and documented.
- Logs redact home directory, obvious tokens, and environment values.
- The tool is usable in a non-TTY terminal for `scan`, `diff`, and `undo`.
- The interactive UI is keyboard-only and works over SSH.
- All checks must have deterministic fixtures and tests.
- macOS and Linux are the first target platforms; Windows is research-only until adapters are verified.

## Explicit limits

- The tool cannot prove that a Skill is good, useful, or harmless.
- It cannot know which capability the user intended to activate without the user's choice.
- Semantic overlap, prompt quality, model behavior, and subtle instruction conflicts are out of scope for deterministic P0 checks.
- Absence of a finding is not a certificate of safety.
- A host update may change config locations or precedence rules; unsupported versions must be reported.
- `undo` can only restore files recorded in its transaction, not external side effects performed earlier by a Skill, MCP server, or hook.

## Open product questions

- Which conflicts are worth showing by default, and which should require `--verbose`?
- Should a user acknowledgment be recorded for a risky Skill, and where?
- Is a local usage signal reliable enough to suggest "unused", or should that remain experimental?
- How should project-local and global configuration be distinguished in the UI?
- What is the minimum host-version matrix that can be supported honestly?

## Implementation status (2026-11-11)

P0 and P1 commands are implemented as a pre-release CLI: `scan`, `explain`, `fix`, `apply`, `diff`, `history`, `show`, `undo`, `add`, `report`, and `hosts`. `add` accepts local directories only. The default scan is read-only against host configuration, emits a compact Chinese terminal summary, and writes a local HTML report. All fixes require an explicit command and are recorded in a local transaction.

The first implementation deliberately reports fewer findings than the maximum theoretical set: risk detection is limited to structured declarations to reduce false positives, and “unused capability” is only a low-confidence hint when a setup has many MCP servers. Phase 4 host integration remains out of scope.
