import { resolve } from "node:path";
import type { CapabilityDeclaration, Inventory } from "./types.js";
import {
  detectCapabilities,
  extractPathReferences,
  hashBytes,
  isDirectory,
  listFiles,
  parseFrontmatter,
  pathExists,
  readJsonSafe,
  readTextSafe,
  redact,
  resolveReference,
  truncate,
} from "./util.js";

export interface PreflightResult {
  source: string;
  inspectedFiles: string[];
  name?: string;
  description?: string;
  conflicts: string[];
  risks: CapabilityDeclaration[];
  missingReferences: string[];
  unsupported: string[];
}

export async function preflightLocalSource(source: string, inventory: Inventory): Promise<PreflightResult> {
  const root = resolve(source);
  if (!(await isDirectory(root))) throw new Error(`预检源不是目录：${root}`);
  const files = await listFiles(root, 3);
  if (files.length > 200) throw new Error("预检源文件过多，拒绝继续");
  const skillFiles = files.filter((file) => file.endsWith("/SKILL.md"));
  const skillFile = skillFiles[0] ?? (await pathExists(resolve(root, "SKILL.md")) ? resolve(root, "SKILL.md") : undefined);
  const skillText = skillFile ? await readTextSafe(skillFile) : undefined;
  const frontmatter = skillText ? parseFrontmatter(skillText) : {};
  const name = frontmatter.name;
  const description = frontmatter.description;

  const conflicts: string[] = [];
  if (name) {
    for (const skill of inventory.skills.filter((item) => item.enabled && item.name.toLowerCase() === name.toLowerCase())) {
      conflicts.push(`同名 Skill 已生效：${skill.source.scope} · ${skill.path}`);
    }
  }

  const manifestFiles = files.filter((file) => file.endsWith("plugin.json") || file.endsWith("package.json") || file.endsWith("mcp.json") || file.endsWith("servers.json"));
  for (const manifestPath of manifestFiles) {
    const manifest = await readJsonSafe<Record<string, unknown>>(manifestPath);
    if (!manifest) continue;
    const manifestText = JSON.stringify(manifest);
    if (typeof manifest.name === "string") {
      for (const plugin of inventory.plugins.filter((item) => item.enabled && item.name.toLowerCase() === String(manifest.name).toLowerCase())) {
        conflicts.push(`同名插件已生效：${plugin.source.scope} · ${plugin.manifestPath}`);
      }
    }
    const mcpServers = manifest.mcpServers;
    if (mcpServers && typeof mcpServers === "object" && !Array.isArray(mcpServers)) {
      for (const [serverName, rawEntry] of Object.entries(mcpServers)) {
        const command = typeof rawEntry === "object" && rawEntry && "command" in rawEntry ? String(rawEntry.command) : undefined;
        for (const mcp of inventory.mcps.filter((item) => item.enabled && (item.name === serverName || (command && item.command === command)))) {
          conflicts.push(`MCP 可能重复：${serverName} ↔ ${mcp.name} · ${mcp.source.location.path}`);
        }
      }
    }
    void manifestText;
  }

  const risks: CapabilityDeclaration[] = [];
  const missingReferences: string[] = [];
  const unsupported: string[] = [];
  for (const file of files.slice(0, 120)) {
    const text = await readTextSafe(file);
    if (text === undefined) {
      unsupported.push(`无法读取：${file}`);
      continue;
    }
    if (hashBytes(text) && /\.(md|json|toml|yaml|yml|ts|js|mjs|cjs|py|sh)$/.test(file)) risks.push(...detectCapabilities(text, file));
    for (const reference of extractPathReferences(text)) {
      const absolute = resolveReference(reference, file, inventory.roots.home);
      if (!(await pathExists(absolute))) missingReferences.push(`${file} → ${reference}`);
    }
  }

  return {
    source: root,
    inspectedFiles: files,
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
    conflicts: [...new Set(conflicts)].slice(0, 20),
    risks: risks.slice(0, 12),
    missingReferences: missingReferences.slice(0, 20),
    unsupported: unsupported.slice(0, 20),
  };
}

export function formatPreflight(result: PreflightResult): string {
  const lines = [
    `预检源：${result.source}`,
    `已检查文件：${result.inspectedFiles.length}`,
    ...(result.name ? [`Skill：${result.name}`] : []),
    ...(result.description ? [`说明：${redact(truncate(result.description, 120))}`] : []),
  ];
  lines.push(result.conflicts.length ? `冲突：${result.conflicts.length}` : "冲突：无");
  for (const conflict of result.conflicts) lines.push(`- ${redact(conflict)}`);
  lines.push(result.risks.length ? `能力声明：${result.risks.length}` : "能力声明：无");
  for (const risk of result.risks.slice(0, 6)) lines.push(`- ${risk.kind} · ${risk.evidence}${risk.line ? `:${risk.line}` : ""}`);
  lines.push(result.missingReferences.length ? `缺失引用：${result.missingReferences.length}` : "缺失引用：无");
  for (const reference of result.missingReferences.slice(0, 6)) lines.push(`- ${redact(reference)}`);
  lines.push("未执行：没有运行安装脚本、MCP 命令、Skill 或 hook。");
  return lines.join("\n");
}
