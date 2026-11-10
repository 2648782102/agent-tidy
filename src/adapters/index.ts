import { basename, dirname, resolve } from "node:path";
import { parse as parseToml } from "smol-toml";
import type {
  HostStatus,
  InstructionRecord,
  Inventory,
  McpRecord,
  PluginRecord,
  Roots,
  Scope,
  SkillRecord,
  SourceRef,
  UnsupportedRecord,
} from "../types.js";
import {
  commandExists,
  detectCapabilities,
  displayPath,
  extractPathReferences,
  hashBytes,
  isDirectory,
  listDirectories,
  listFiles,
  parseFrontmatter,
  pathExists,
  readJsonSafe,
  readTextSafe,
  resolveReference,
  sourceLocation,
  stableId,
} from "../util.js";
import { blockLocation, disableTomlBlock, splitTomlBlocks, type TomlBlock } from "./toml-blocks.js";

export interface AdapterContext {
  roots: Roots;
  inspectedPaths: string[];
  unsupported: UnsupportedRecord[];
  hosts: HostStatus[];
  skills: SkillRecord[];
  mcps: McpRecord[];
  hooks: Inventory["hooks"];
  plugins: PluginRecord[];
  instructions: InstructionRecord[];
  tomlBlocks: Map<string, TomlBlock[]>;
}

export interface HostAdapter {
  readonly version: string;
  discover(context: AdapterContext): Promise<void>;
}

interface JsonObject {
  [key: string]: unknown;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function source(host: SourceRef["host"], scope: Scope, path: string, label: string, text: string, needle: string, field?: string): SourceRef {
  return { host, scope, label, location: sourceLocation(path, text, needle, field) };
}

function markInspected(context: AdapterContext, path: string): void {
  context.inspectedPaths.push(path);
}

function addUnsupported(context: AdapterContext, host: SourceRef["host"], path: string, reason: string): void {
  context.unsupported.push({ id: stableId("unsupported", [host, path, reason]), host, path, reason });
}

function deterministicRules(text: string, path: string): InstructionRecord["deterministicRules"] {
  const patterns: Array<{ id: string; pattern: RegExp; normalize?: (match: RegExpExecArray) => { key: string; value: string } }> = [
    {
      id: "approval-policy",
      pattern: /\b(approval policy|approval_policy|permission mode)\s*(?:is|:|=|to)\s*(never|on-request|untrusted|on-failure|plan|default|acceptEdits|bypassPermissions)\b/i,
      normalize: (match) => ({ key: "approval-policy", value: (match[2] ?? "").toLowerCase() }),
    },
    {
      id: "test-command",
      pattern: /\b(?:run|use)\s+(npm test|pnpm test|yarn test|bun test|npm run check|npm run build)\b/i,
      normalize: (match) => ({ key: "test-command", value: (match[1] ?? "").toLowerCase().replace(/\s+/g, " ") }),
    },
    {
      id: "git-commit-policy",
      pattern: /\b(?:never|do not|don't|always)\s+(?:git\s+)?commit\b/i,
      normalize: (match) => ({ key: "git-commit", value: /never|do not|don't/i.test(match[0]) ? "forbidden" : "allowed" }),
    },
  ];
  const rules: InstructionRecord["deterministicRules"] = [];
  text.split("\n").forEach((line, index) => {
    for (const { id, pattern, normalize } of patterns) {
      const match = pattern.exec(line);
      if (!match) continue;
      const normalized = normalize?.(match) ?? { key: id, value: match[0].toLowerCase() };
      rules.push({ id, ...normalized, line: index + 1, raw: line.trim() });
    }
  });
  return rules;
}

async function readInstruction(context: AdapterContext, host: SourceRef["host"], scope: Scope, path: string, label: string, precedence: number): Promise<void> {
  const text = await readTextSafe(path);
  if (text === undefined) return;
  markInspected(context, path);
  const imports = extractPathReferences(text).map((reference) => resolveReference(reference, path, context.roots.home));
  context.instructions.push({
    id: stableId("instruction", [host, scope, path]),
    path,
    scope,
    source: source(host, scope, path, label, text, text.split("\n")[0] ?? ""),
    importedFiles: imports,
    deterministicRules: deterministicRules(text, path),
  });
  void precedence;
}

async function readSkill(context: AdapterContext, host: SourceRef["host"], scope: Scope, skillFile: string, label: string, enabled: boolean, precedence: number): Promise<void> {
  const text = await readTextSafe(skillFile);
  if (text === undefined) return;
  markInspected(context, skillFile);
  const frontmatter = parseFrontmatter(text);
  const name = frontmatter.name ?? skillFile.split("/").at(-2) ?? "unnamed-skill";
  const declaredFiles = extractPathReferences(text).map((reference) => resolveReference(reference, skillFile, context.roots.home));
  context.skills.push({
    id: stableId("skill", [host, scope, skillFile]),
    name,
    description: frontmatter.description ?? "",
    path: skillFile,
    source: source(host, scope, skillFile, label, text, `name: ${name}`, "frontmatter.name"),
    contentHash: hashBytes(text),
    capabilities: detectCapabilities(text, skillFile),
    declaredFiles,
    enabled,
    precedence,
  });
}

async function discoverSkillRoot(context: AdapterContext, host: SourceRef["host"], scope: Scope, root: string, label: string, enabled: boolean, precedence: number): Promise<void> {
  if (!(await isDirectory(root))) return;
  const skillDirectories = await listDirectories(root);
  for (const directory of skillDirectories) {
    if (basename(directory).startsWith(".")) continue;
    const skillFile = resolve(directory, "SKILL.md");
    if (await pathExists(skillFile)) await readSkill(context, host, scope, skillFile, label, enabled, precedence);
  }
}

function tomlBlockFor(context: AdapterContext, path: string, text: string, predicate: (block: TomlBlock) => boolean): TomlBlock | undefined {
  let blocks = context.tomlBlocks.get(path);
  if (!blocks) {
    blocks = splitTomlBlocks(text);
    context.tomlBlocks.set(path, blocks);
  }
  return blocks.find(predicate);
}

function envKeys(value: unknown): string[] {
  if (!isJsonObject(value)) return [];
  return Object.keys(value).sort();
}

function parseMcpEntry(entry: JsonObject): { command?: string; args: string[]; url?: string; envKeys: string[]; values: string[] } {
  const env = isJsonObject(entry.env) ? entry.env : {};
  const values = Object.values(entry)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === "string");
  return {
    ...(typeof entry.command === "string" ? { command: entry.command } : {}),
    args: stringArray(entry.args),
    ...(typeof entry.url === "string" ? { url: entry.url } : {}),
    envKeys: Object.keys(env).sort(),
    values,
  };
}

function referencedFilesForMcp(parsed: ReturnType<typeof parseMcpEntry>, configPath: string): string[] {
  const paths: string[] = [];
  for (const value of [parsed.command, ...parsed.args]) {
    if (!value) continue;
    if (value.includes("/") && !value.startsWith("-")) paths.push(resolve(dirname(configPath), value));
  }
  return paths;
}

function pluginReferencedFiles(manifest: JsonObject, manifestPath: string): string[] {
  const paths: string[] = [];
  for (const value of Object.values(manifest)) {
    if (typeof value !== "string" || !value.startsWith("./")) continue;
    paths.push(resolve(dirname(manifestPath), value));
  }
  if (isJsonObject(manifest.interface)) {
    for (const value of Object.values(manifest.interface)) {
      if (typeof value === "string" && value.startsWith("./")) paths.push(resolve(dirname(manifestPath), value));
    }
  }
  return paths;
}

function keyMatches(host: "codex" | "claude-code", keyPath: string[], kind: "mcp" | "plugin"): boolean {
  if (host === "codex") {
    return kind === "mcp" ? keyPath[0] === "mcp_servers" : keyPath[0] === "plugins";
  }
  return kind === "mcp" ? keyPath[0] === "mcpServers" : keyPath[0] === "enabledPlugins";
}

export class CodexAdapter implements HostAdapter {
  readonly version = "codex-2026-11-11.1";

  async discover(context: AdapterContext): Promise<void> {
    const codexHome = context.roots.codexHome ?? resolve(context.roots.home, ".codex");
    const configPath = resolve(codexHome, "config.toml");
    const configText = await readTextSafe(configPath);
    let parsed: JsonObject = {};
    let hostVersion: string | undefined;
    if (configText !== undefined) {
      markInspected(context, configPath);
      try {
        parsed = parseToml(configText) as JsonObject;
      } catch {
        addUnsupported(context, "codex", configPath, "config.toml could not be parsed as TOML");
      }
      hostVersion = asString(parsed.model) ?? asString(parsed.model_provider);
    }
    context.hosts.push({
      name: "codex",
      adapterVersion: this.version,
      ...(hostVersion ? { hostVersion } : {}),
      supported: true,
      notes: ["User config: ~/.codex/config.toml", "Project config: <cwd>/.codex/config.toml when trusted", "Skills: ~/.codex/skills and plugin cache skills"],
    });

    await this.discoverConfig(context, configPath, configText, "user");
    const projectConfig = resolve(context.roots.cwd, ".codex", "config.toml");
    if (projectConfig !== configPath) await this.discoverConfig(context, projectConfig, await readTextSafe(projectConfig), "project");

    await discoverSkillRoot(context, "codex", "user", resolve(codexHome, "skills"), "Codex user Skills", true, 20);
    await discoverSkillRoot(context, "codex", "project", resolve(context.roots.cwd, ".codex", "skills"), "Codex project Skills", true, 40);

    const pluginCache = resolve(codexHome, "plugins", "cache");
    if (await isDirectory(pluginCache)) {
      const manifestPaths = (await listFiles(pluginCache, 4)).filter((path) => path.endsWith("/.codex-plugin/plugin.json"));
      for (const manifestPath of manifestPaths) {
        const manifest = await readJsonSafe<JsonObject>(manifestPath);
        if (!manifest) {
          addUnsupported(context, "codex", manifestPath, "plugin.json could not be parsed");
          continue;
        }
        markInspected(context, manifestPath);
        const pluginName = asString(manifest.name) ?? manifestPath.split("/").at(-3) ?? "unknown-plugin";
        const pluginId = stableId("plugin", ["codex", manifestPath, pluginName]);
        context.plugins.push({
          id: pluginId,
          name: pluginName,
          source: source("codex", "plugin", manifestPath, "Codex plugin manifest", JSON.stringify(manifest), pluginName, "name"),
          enabled: true,
          manifestPath,
          referencedFiles: pluginReferencedFiles(manifest, manifestPath),
        });
        const skillsValue = asString(manifest.skills);
        if (skillsValue) {
          const skillsRoot = resolve(dirname(manifestPath), skillsValue);
          await discoverSkillRoot(context, "codex", "plugin", skillsRoot, `Codex plugin ${pluginName} Skills`, true, 10);
        }
      }
    }

    await readInstruction(context, "codex", "project", resolve(context.roots.cwd, "AGENTS.md"), "Codex AGENTS.md", 40);
    await readInstruction(context, "codex", "user", resolve(codexHome, "AGENTS.md"), "Codex user AGENTS.md", 20);
  }

  private async discoverConfig(context: AdapterContext, configPath: string, configText: string | undefined, scope: Scope): Promise<void> {
    if (configText === undefined) return;
    markInspected(context, configPath);
    let parsed: JsonObject;
    try {
      parsed = parseToml(configText) as JsonObject;
    } catch {
      addUnsupported(context, "codex", configPath, "config.toml could not be parsed as TOML");
      return;
    }
    const blocks = splitTomlBlocks(configText);
    context.tomlBlocks.set(configPath, blocks);

    const mcpServers = isJsonObject(parsed.mcp_servers) ? parsed.mcp_servers : {};
    for (const [name, rawEntry] of Object.entries(mcpServers)) {
      if (!isJsonObject(rawEntry)) continue;
      const block = blocks.find((candidate) => candidate.keyPath[0] === "mcp_servers" && candidate.keyPath[1] === name);
      if (!block) continue;
      const entry = parseMcpEntry(rawEntry);
      const command = entry.command;
      const label = `Codex MCP server ${name}`;
      const location = blockLocation(configPath, block, "command");
      const executableExists = command ? await commandExists(command) : undefined;
      context.mcps.push({
        id: stableId("mcp", ["codex", scope, configPath, name]),
        name,
        ...(command ? { command } : {}),
        args: entry.args,
        ...(entry.url ? { url: entry.url } : {}),
        environmentKeys: entry.envKeys,
        source: { host: "codex", scope, location, label },
        enabled: !block.keyPath.includes("disabled"),
        ...(executableExists === undefined ? {} : { executableExists }),
        referencedFiles: referencedFilesForMcp(entry, configPath),
        duplicateKey: [entry.command, ...entry.args, entry.url].filter(Boolean).join("\u0000") || name,
      });
    }

    const plugins = isJsonObject(parsed.plugins) ? parsed.plugins : {};
    for (const [name, rawEntry] of Object.entries(plugins)) {
      if (!isJsonObject(rawEntry)) continue;
      const block = blocks.find((candidate) => candidate.keyPath[0] === "plugins" && candidate.keyPath[1] === name);
      if (!block) continue;
      context.plugins.push({
        id: stableId("plugin-config", ["codex", scope, configPath, name]),
        name,
        source: { host: "codex", scope, location: blockLocation(configPath, block, "enabled"), label: `Codex plugin entry ${name}` },
        enabled: rawEntry.enabled !== false,
        manifestPath: configPath,
        referencedFiles: [],
      });
    }

    const skillConfigs = Array.isArray(parsed.skills) ? parsed.skills : [];
    for (const [index, raw] of skillConfigs.entries()) {
      if (!isJsonObject(raw)) continue;
      const skillPath = asString(raw.path);
      if (!skillPath) continue;
      const absolutePath = resolve(dirname(configPath), skillPath);
      const block = blocks.find((candidate) => candidate.keyPath[0] === "skills" && candidate.keyPath[1] === "config");
      await readSkill(context, "codex", scope, absolutePath, `Codex skills.config[${index}]`, raw.enabled !== false, scope === "project" ? 40 : 20);
      void block;
      void disableTomlBlock;
    }
  }
}

export class ClaudeCodeAdapter implements HostAdapter {
  readonly version = "claude-code-2026-11-11.1";

  async discover(context: AdapterContext): Promise<void> {
    const claudeHome = context.roots.claudeHome ?? resolve(context.roots.home, ".claude");
    context.hosts.push({
      name: "claude-code",
      adapterVersion: this.version,
      supported: true,
      notes: ["User settings: ~/.claude/settings.json", "Project settings: <cwd>/.claude/settings.json and settings.local.json", "MCP: ~/.claude.json, .mcp.json, and settings.json"],
    });

    const settingsPaths = [
      { path: resolve(claudeHome, "settings.json"), scope: "user" as Scope, label: "Claude Code user settings" },
      { path: resolve(claudeHome, "settings.local.json"), scope: "user" as Scope, label: "Claude Code user local settings" },
      { path: resolve(context.roots.cwd, ".claude", "settings.json"), scope: "project" as Scope, label: "Claude Code project settings" },
      { path: resolve(context.roots.cwd, ".claude", "settings.local.json"), scope: "project" as Scope, label: "Claude Code project local settings" },
    ];
    for (const settingsPath of settingsPaths) await this.discoverSettings(context, settingsPath.path, settingsPath.scope, settingsPath.label);

    const mcpPaths = [
      { path: resolve(context.roots.home, ".claude.json"), scope: "user" as Scope, label: "Claude Code user MCP config" },
      { path: resolve(context.roots.cwd, ".mcp.json"), scope: "project" as Scope, label: "Claude Code project MCP config" },
    ];
    for (const mcpPath of mcpPaths) await this.discoverMcpConfig(context, mcpPath.path, mcpPath.scope, mcpPath.label);

    await discoverSkillRoot(context, "claude-code", "user", resolve(claudeHome, "skills"), "Claude Code user Skills", true, 20);
    await discoverSkillRoot(context, "claude-code", "project", resolve(context.roots.cwd, ".claude", "skills"), "Claude Code project Skills", true, 40);

    await readInstruction(context, "claude-code", "project", resolve(context.roots.cwd, "CLAUDE.md"), "Claude Code project memory", 40);
    await readInstruction(context, "claude-code", "project", resolve(context.roots.cwd, "CLAUDE.local.md"), "Claude Code project local memory", 50);
    await readInstruction(context, "claude-code", "user", resolve(claudeHome, "CLAUDE.md"), "Claude Code user memory", 20);
  }

  private async discoverSettings(context: AdapterContext, path: string, scope: Scope, label: string): Promise<void> {
    const text = await readTextSafe(path);
    if (text === undefined) return;
    markInspected(context, path);
    const settings = await readJsonSafe<JsonObject>(path);
    if (!settings) {
      addUnsupported(context, "claude-code", path, "settings.json could not be parsed as JSON");
      return;
    }

    const mcpServers = isJsonObject(settings.mcpServers) ? settings.mcpServers : {};
    for (const [name, rawEntry] of Object.entries(mcpServers)) {
      if (!isJsonObject(rawEntry)) continue;
      const entry = parseMcpEntry(rawEntry);
      const executableExists = entry.command ? await commandExists(entry.command) : undefined;
      context.mcps.push({
        id: stableId("mcp", ["claude-code", scope, path, name]),
        name,
        ...(entry.command ? { command: entry.command } : {}),
        args: entry.args,
        ...(entry.url ? { url: entry.url } : {}),
        environmentKeys: entry.envKeys,
        source: source("claude-code", scope, path, label, text, `"${name}"`, "mcpServers"),
        enabled: rawEntry.disabled !== true,
        ...(executableExists === undefined ? {} : { executableExists }),
        referencedFiles: referencedFilesForMcp(entry, path),
        duplicateKey: [entry.command, ...entry.args, entry.url].filter(Boolean).join("\u0000") || name,
      });
    }

    const hooks = isJsonObject(settings.hooks) ? settings.hooks : {};
    for (const [event, rawMatchers] of Object.entries(hooks)) {
      if (!Array.isArray(rawMatchers)) continue;
      for (const [matcherIndex, rawMatcher] of rawMatchers.entries()) {
        if (!isJsonObject(rawMatcher) || !Array.isArray(rawMatcher.hooks)) continue;
        for (const [hookIndex, rawHook] of rawMatcher.hooks.entries()) {
          if (!isJsonObject(rawHook)) continue;
          const command = asString(rawHook.command);
          const hookPath = asString(rawHook.path);
          const id = stableId("hook", ["claude-code", scope, path, event, matcherIndex, hookIndex]);
          context.hooks.push({
            id,
            event,
            ...(command ? { command } : {}),
            path: hookPath ?? command ?? path,
            source: source("claude-code", scope, path, label, text, event, `hooks.${event}`),
            capabilities: command ? detectCapabilities(command, path) : [],
            enabled: true,
          });
        }
      }
    }

    const enabledPlugins = isJsonObject(settings.enabledPlugins) ? settings.enabledPlugins : {};
    for (const [name, enabled] of Object.entries(enabledPlugins)) {
      context.plugins.push({
        id: stableId("plugin-config", ["claude-code", scope, path, name]),
        name,
        source: source("claude-code", scope, path, label, text, `"${name}"`, "enabledPlugins"),
        enabled: enabled !== false,
        manifestPath: path,
        referencedFiles: [],
      });
    }
  }

  private async discoverMcpConfig(context: AdapterContext, path: string, scope: Scope, label: string): Promise<void> {
    const text = await readTextSafe(path);
    if (text === undefined) return;
    markInspected(context, path);
    const config = await readJsonSafe<JsonObject>(path);
    if (!config) {
      addUnsupported(context, "claude-code", path, "MCP config could not be parsed as JSON");
      return;
    }
    const mcpServers = isJsonObject(config.mcpServers) ? config.mcpServers : {};
    for (const [name, rawEntry] of Object.entries(mcpServers)) {
      if (!isJsonObject(rawEntry)) continue;
      const entry = parseMcpEntry(rawEntry);
      const executableExists = entry.command ? await commandExists(entry.command) : undefined;
      context.mcps.push({
        id: stableId("mcp", ["claude-code", scope, path, name]),
        name,
        ...(entry.command ? { command: entry.command } : {}),
        args: entry.args,
        ...(entry.url ? { url: entry.url } : {}),
        environmentKeys: entry.envKeys,
        source: source("claude-code", scope, path, label, text, `"${name}"`, "mcpServers"),
        enabled: rawEntry.disabled !== true,
        ...(executableExists === undefined ? {} : { executableExists }),
        referencedFiles: referencedFilesForMcp(entry, path),
        duplicateKey: [entry.command, ...entry.args, entry.url].filter(Boolean).join("\u0000") || name,
      });
    }
  }
}

export function createAdapterContext(roots: Roots): AdapterContext {
  return {
    roots,
    inspectedPaths: [],
    unsupported: [],
    hosts: [],
    skills: [],
    mcps: [],
    hooks: [],
    plugins: [],
    instructions: [],
    tomlBlocks: new Map(),
  };
}

export async function buildInventory(roots: Roots): Promise<Inventory> {
  const context = createAdapterContext(roots);
  const adapters: HostAdapter[] = [new CodexAdapter(), new ClaudeCodeAdapter()];
  for (const adapter of adapters) await adapter.discover(context);
  return {
    roots,
    hosts: context.hosts,
    skills: context.skills,
    mcps: context.mcps,
    hooks: context.hooks,
    plugins: context.plugins,
    instructions: context.instructions,
    unsupported: context.unsupported,
    inspectedPaths: [...new Set(context.inspectedPaths)].sort(),
  };
}

export function adapterVersions(inventory: Inventory): Record<string, string> {
  return Object.fromEntries(inventory.hosts.map((host) => [host.name, host.adapterVersion]));
}

export function formatInspectedPath(path: string, roots: Roots): string {
  return displayPath(path, roots);
}
