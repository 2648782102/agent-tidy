# Host adapter notes

Snapshot date: 2026-11-11. These notes describe what `agent-tidy` inspects, not a guarantee about every host version.

## Codex

Official configuration documentation states that personal defaults live in `~/.codex/config.toml`, project overrides live in `.codex/config.toml` files, and project `.codex/` layers are loaded only for trusted projects. Codex MCP configuration is stored in `config.toml`, with `~/.codex/config.toml` as the default and project `.codex/config.toml` available for trusted projects. Skills are folders containing `SKILL.md`; `[[skills.config]]` entries can disable a Skill by path.

Inspected by the Codex adapter:

- `~/.codex/config.toml`
- `<cwd>/.codex/config.toml`
- `~/.codex/skills/*/SKILL.md`
- `<cwd>/.codex/skills/*/SKILL.md`
- `~/.codex/plugins/cache/**/.codex-plugin/plugin.json` and each manifest’s declared `skills/` directory
- `<cwd>/AGENTS.md`
- `~/.codex/AGENTS.md`

Not interpreted:

- Codex runtime state databases, session history, memories, authentication, and app-managed caches.
- Project trust decisions beyond recording the adapter’s scope.
- Remote plugin marketplaces, plugin install scripts, or generated plugin state.
- Whether a host has actually loaded a config layer in the current process.

References:

- [Config basics](https://learn.chatgpt.com/docs/config-file/config-basic)
- [Model Context Protocol](https://learn.chatgpt.com/docs/extend/mcp)
- [Build skills](https://learn.chatgpt.com/docs/build-skills)
- [Customization](https://learn.chatgpt.com/docs/customization/overview)

## Claude Code

Official Claude Code documentation describes `settings.json` configuration, `claude mcp`, `.mcp.json` passed through `--mcp-config`, hooks in settings, and `CLAUDE.md` memory scopes including user and project files.

Inspected by the Claude Code adapter:

- `~/.claude/settings.json`
- `~/.claude/settings.local.json`
- `<cwd>/.claude/settings.json`
- `<cwd>/.claude/settings.local.json`
- `~/.claude.json`
- `<cwd>/.mcp.json`
- `~/.claude/skills/*/SKILL.md`
- `<cwd>/.claude/skills/*/SKILL.md`
- `<cwd>/CLAUDE.md`
- `<cwd>/CLAUDE.local.md`
- `~/.claude/CLAUDE.md`

Not interpreted:

- Enterprise managed policy precedence, CLI flag overrides, and in-memory runtime state.
- Credential stores, OAuth state, and session transcripts.
- The meaning of arbitrary custom settings keys.
- Whether a hook or MCP server is currently running.

References:

- [Claude Code CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-usage)
- [Claude Code settings](https://docs.anthropic.com/en/docs/claude-code/settings)
- [Claude Code memory](https://docs.anthropic.com/en/docs/claude-code/memory)
- [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks)

## Version drift

Each adapter has a dated version string. `agent-tidy hosts --json` prints adapter versions, inspected paths, and unsupported items. A host update that moves config paths or changes precedence requires a new adapter version and fixture tests before high-confidence fixes are offered.
