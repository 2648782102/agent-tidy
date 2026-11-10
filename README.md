# agent-tidy

**A one-command cleanup and safety check for a personal coding-agent setup.**

After a while, Codex and Claude Code collect half-remembered Skills, duplicated MCP servers, stale hooks, overlapping `AGENTS.md` / `CLAUDE.md` rules, and old plugin entries. `agent-tidy` finds the small number of high-confidence problems that a person can understand, lets them choose a fix, and keeps every change reversible.

The project is still a design and planning repository. No implementation exists yet.

## The problem

Personal coding-agent configuration is spread across host config files, global and project Skill directories, plugin manifests, MCP settings, hooks, and instruction files. A user can no longer easily answer:

- Which Skills are visible to this host, and which copy actually wins?
- Which MCP commands are broken, duplicated, or no longer used?
- Which installed capability can read secrets, use the network, or write outside the project?
- Which rule is silently overriding another rule?
- What changed when an Agent's behavior changed?
- Which file must be edited to disable one capability safely?

Existing tools often answer with another dashboard, a catalog, a benchmark, or a long report. `agent-tidy` should answer with a short, actionable list and a reversible fix.

## Product goal

Make a person's local coding-agent setup understandable and safe to change in one command.

The first usable version should let a user:

1. Run `agent-tidy` from any directory without a Git repository, account, daemon, or model API.
2. See only high-confidence findings: duplicates, shadowing, stale paths, missing commands, unsafe declarations, and obvious instruction conflicts.
3. Select one or more fixes from a compact terminal UI.
4. Preview the exact file changes before anything is written.
5. Restore the previous state with `agent-tidy undo`.

If there is nothing worth fixing, the command prints one line and exits. It does not produce a report that the user has to find, open, and interpret.

## Non-goals

- Another Skill library, Skill marketplace, or awesome list.
- Another MCP server or cloud service.
- A team governance platform, telemetry service, or web dashboard.
- An LLM-based semantic auditor; the first version uses deterministic checks only.
- A general package manager, shell framework, or coding-agent harness.
- A replacement for the host's own `doctor`, plugin manager, or permission system.
- Automatic deletion of user files.

## Product principles

- **Action over report.** Every finding has a concrete next action or is not shown.
- **Local and read-only until confirmed.** Discovery does not mutate configuration. Fixes require an explicit selection and preview.
- **Reversible by default.** Every write is recorded in a local manifest and can be undone.
- **Small surface.** CLI/TUI first; no MCP-first architecture and no service dependency.
- **High confidence.** Prefer a few certain findings over a long list of speculative advice.
- **Personal first.** Support one machine and a small number of hosts before scaling to teams.
- **Explicit uncertainty.** Unknown host versions and unfamiliar file formats are reported as unsupported, not guessed.
- **No Git requirement.** Git may be one data source, but the tool works outside a repository.

## Proposed commands

```text
agent-tidy              # scan, then open an interactive fix list when needed
agent-tidy scan         # read-only scan with a compact result list
agent-tidy explain <id> # explain where one Skill, MCP, hook, or rule comes from
agent-tidy add <source> # preflight a Skill or plugin source before installing it
agent-tidy diff         # show the pending fix plan
agent-tidy undo         # restore the most recent transaction, or a selected one
```

The command names are a design proposal, not yet a frozen CLI contract.

## MVP scope

### Supported hosts

1. Codex CLI / Codex desktop configuration that is visible on the local machine.
2. Claude Code user and project configuration on the same machine.

Other hosts are out of scope until the first version is validated with real personal setups.

### Deterministic checks

| Check | Finding | Possible fix |
| --- | --- | --- |
| Duplicate Skill names or IDs | Two installed Skills cannot be distinguished by invocation | Disable one copy, rename after confirmation |
| Skill shadowing | A project or host-local copy overrides another copy | Show both paths and offer disable/rename |
| Stale MCP command | The configured executable or arguments cannot be resolved | Disable server or edit command with confirmation |
| Duplicate MCP server | The same server appears in multiple active config scopes | Disable one scope |
| Missing referenced file | A Skill, hook, or plugin points to a path that no longer exists | Disable the broken entry |
| Dangerous declaration | A local Skill declares broad shell, network, secret, or filesystem behavior | Show the exact declaration; disable or acknowledge |
| Instruction overlap | Multiple active `AGENTS.md` / `CLAUDE.md` files contain conflicting deterministic rules | Show the source lines; no automatic rewrite in MVP |
| Unused capability | An installed Skill, MCP server, or hook has no recorded use in available local session data | Suggest disable; never delete automatically |

The MVP must not claim that a configuration is "safe". It can only state what it observed, what it did not inspect, and which selected changes were made.

### Fix transaction

Every confirmed fix writes:

- a timestamped backup of each affected file;
- a unified diff or structured before/after record;
- a transaction manifest with host scope, check ID, and exact paths;
- enough metadata for `undo` to restore file contents and permissions.

The first version should prefer renaming or adding an explicit `disabled` marker over deletion. It should refuse to continue when a target file changed between scan and apply.

## Success criteria

The MVP is useful only if all of the following are true with a real local setup:

- It finds at least one previously unknown issue that the user wants to fix.
- A selected fix changes the behavior or visible configuration of the current Agent.
- `agent-tidy undo` restores the exact previous state.
- The whole flow works without network access, API keys, GitHub, a Git repository, or an LLM.
- A first-time user can finish the flow without reading a long manual.
- A clean setup produces one concise confirmation, not a document.

## Community signal and references

The direction follows a second-order need created by the rapid growth of Agent Skills, MCP servers, hooks, and personal Agent configuration. See [RESEARCH.md](RESEARCH.md) for the repository snapshot, representative projects, and the reasoning behind the scope.

## Documents

- [Product requirements](PRODUCT.md)
- [Research and positioning](RESEARCH.md)
- [Architecture](ARCHITECTURE.md)
- [Roadmap and delivery plan](ROADMAP.md)
- [Development workflow](DEVELOPMENT.md)
- [Contributing](CONTRIBUTING.md)

## Status

Stage: `planning`.

This repository currently contains only project definition, research context, and implementation planning. There is no package, CLI, release, or published artifact.

## License

MIT. See [LICENSE](LICENSE).
