import { dirname, resolve } from "node:path";
import type {
  CapabilityDeclaration,
  DeterministicRule,
  Finding,
  Fix,
  Inventory,
  McpRecord,
  SkillRecord,
} from "./types.js";
import {
  displayPath,
  pathExists,
  pathExists as exists,
  redact,
  stableId,
  truncate,
} from "./util.js";

type FixableRecord = SkillRecord | McpRecord | Inventory["hooks"][number] | Inventory["plugins"][number];

function display(inventory: Inventory, path: string): string {
  return displayPath(path, inventory.roots);
}

function scopeList(values: string[]): string {
  return [...new Set(values)].sort().join(", ");
}

function disableFix(record: FixableRecord): Fix | undefined {
  const sourcePath = record.source.location.path;
  const field = record.source.location.field;
  if ("duplicateKey" in record) {
    if (sourcePath.endsWith(".toml")) {
      return {
        id: stableId("fix", ["disable-mcp-toml", record.id]),
        kind: "disable-mcp-toml",
        label: `禁用 MCP ${record.name}`,
        targetPath: sourcePath,
        targetId: record.id,
        description: `在 TOML 配置中将 [mcp_servers.${record.name}] 标记为 disabled，不删除原配置`,
      };
    }
    return {
      id: stableId("fix", ["disable-mcp-json", record.id]),
      kind: "disable-mcp-json",
      label: `禁用 MCP ${record.name}`,
      targetPath: sourcePath,
      targetId: record.id,
      description: `在 JSON 配置中将 mcpServers.${record.name} 标记为 disabled`,
    };
  }
  if ("contentHash" in record) {
    return {
      id: stableId("fix", ["disable-skill-dir", record.id]),
      kind: "disable-skill-dir",
      label: `停用 Skill ${record.name}`,
      targetPath: dirname(record.path),
      targetId: record.id,
      description: `将 Skill 目录重命名为 .disabled，保留全部文件`,
    };
  }
  if ("event" in record) return undefined;
  if ("manifestPath" in record) return undefined;
  return undefined;
}

function findingId(checkId: string, parts: string[]): string {
  return `${checkId}:${stableId("finding", parts).replace(/^finding-/, "")}`;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    const group = groups.get(value) ?? [];
    group.push(item);
    groups.set(value, group);
  }
  return groups;
}

function active(items: SkillRecord[]): SkillRecord[] {
  return items.filter((item) => item.enabled);
}

function activeMcps(items: McpRecord[]): McpRecord[] {
  return items.filter((item) => item.enabled);
}

async function duplicateSkills(inventory: Inventory): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const [, group] of groupBy(active(inventory.skills), (skill) => skill.name.toLowerCase())) {
    if (group.length < 2) continue;
    const fixes = group.slice(1).map(disableFix).filter((fix): fix is Fix => Boolean(fix));
    findings.push({
      id: findingId("duplicate-skill", group.map((item) => item.id)),
      checkId: "duplicate-skill",
      title: `重复 Skill：${group[0]?.name ?? "unknown"}`,
      detail: "同一名称出现在多个生效范围；调用时可能命中意料之外的副本。",
      severity: "medium",
      confidence: "high",
      evidence: group.map((item) => `${item.source.scope} · ${display(inventory, item.path)}`),
      affectedPaths: group.map((item) => item.path),
      sourceScopes: [...new Set(group.map((item) => item.source.scope))],
      availableFixes: fixes,
      limitations: ["只比较 Skill 名称与显式配置范围，不判断语义内容。"],
    });
  }
  return findings;
}

async function shadowedSkills(inventory: Inventory): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const [, group] of groupBy(active(inventory.skills), (skill) => skill.name.toLowerCase())) {
    const distinctHashes = new Set(group.map((item) => item.contentHash));
    if (group.length < 2 || distinctHashes.size < 2) continue;
    const sorted = group.slice().sort((left, right) => right.precedence - left.precedence);
    const winner = sorted[0];
    const shadowed = sorted.slice(1);
    if (!winner) continue;
    findings.push({
      id: findingId("skill-shadowing", group.map((item) => item.id)),
      checkId: "skill-shadowing",
      title: `Skill 覆盖：${winner.name}`,
      detail: "同名但内容不同的 Skill 同时生效；较高优先级范围可能遮蔽其他副本。",
      severity: "medium",
      confidence: "high",
      evidence: [
        `可能生效：${winner.source.scope} · ${display(inventory, winner.path)}`,
        ...shadowed.map((item) => `可能被遮蔽：${item.source.scope} · ${display(inventory, item.path)}`),
      ],
      affectedPaths: group.map((item) => item.path),
      sourceScopes: [...new Set(group.map((item) => item.source.scope))],
      availableFixes: shadowed.map(disableFix).filter((fix): fix is Fix => Boolean(fix)),
      limitations: ["优先级基于 adapter 中记录的静态范围；不执行宿主来确认运行时选择。"],
    });
  }
  return findings;
}

async function staleMcpCommands(inventory: Inventory): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const mcp of activeMcps(inventory.mcps)) {
    const staleCommand = Boolean(mcp.command) && mcp.executableExists === false;
    const missingFiles: string[] = [];
    for (const path of mcp.referencedFiles) {
      if (!(await exists(path))) missingFiles.push(path);
    }
    if (!staleCommand && missingFiles.length === 0) continue;
    findings.push({
      id: findingId("stale-mcp", [mcp.id]),
      checkId: "stale-mcp",
      title: `MCP 路径失效：${mcp.name}`,
      detail: "启动命令无法解析，或参数引用的本地文件不存在。",
      severity: "high",
      confidence: "high",
      evidence: [
        ...(staleCommand ? [`命令不可解析：${redact(mcp.command ?? "")}`] : []),
        ...missingFiles.map((path) => `文件不存在：${display(inventory, path)}`),
      ],
      affectedPaths: [mcp.source.location.path, ...missingFiles],
      sourceScopes: [mcp.source.scope],
      availableFixes: [disableFix(mcp)].filter((fix): fix is Fix => Boolean(fix)),
      limitations: ["只检查本地路径与 PATH 中的可执行文件，不启动 MCP server。"],
    });
  }
  return findings;
}

async function duplicateMcps(inventory: Inventory): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const [key, group] of groupBy(activeMcps(inventory.mcps), (mcp) => mcp.duplicateKey)) {
    if (group.length < 2 || !key) continue;
    findings.push({
      id: findingId("duplicate-mcp", group.map((item) => item.id)),
      checkId: "duplicate-mcp",
      title: `重复 MCP：${group.map((item) => item.name).join(" / ")}`,
      detail: "多个生效范围配置了同一命令/URL，宿主可能启动重复服务或产生同名冲突。",
      severity: "medium",
      confidence: "high",
      evidence: group.map((item) => `${item.source.scope} · ${display(inventory, item.source.location.path)}`),
      affectedPaths: group.map((item) => item.source.location.path),
      sourceScopes: [...new Set(group.map((item) => item.source.scope))],
      availableFixes: group.slice(1).map(disableFix).filter((fix): fix is Fix => Boolean(fix)),
      limitations: ["只比较命令、参数和 URL；环境变量值不参与比较。"],
    });
  }
  return findings;
}

async function missingReferences(inventory: Inventory): Promise<Finding[]> {
  const findings: Finding[] = [];
  const records: Array<{ id: string; label: string; path: string; references: string[]; sourcePath: string }> = [];
  for (const skill of active(inventory.skills)) {
    records.push({ id: skill.id, label: `Skill ${skill.name}`, path: skill.path, references: skill.declaredFiles, sourcePath: skill.path });
  }
  for (const instruction of inventory.instructions) {
    records.push({ id: instruction.id, label: "指令文件", path: instruction.path, references: instruction.importedFiles, sourcePath: instruction.path });
  }
  for (const plugin of inventory.plugins.filter((item) => item.enabled)) {
    records.push({ id: plugin.id, label: `插件 ${plugin.name}`, path: plugin.manifestPath, references: plugin.referencedFiles, sourcePath: plugin.manifestPath });
  }
  for (const record of records) {
    const missing: string[] = [];
    for (const reference of record.references) {
      if (!(await pathExists(reference))) missing.push(reference);
    }
    if (missing.length === 0) continue;
    findings.push({
      id: findingId("missing-reference", [record.id, ...missing]),
      checkId: "missing-reference",
      title: `缺失引用：${record.label}`,
      detail: "配置或文档引用的本地文件不存在。",
      severity: "medium",
      confidence: "high",
      evidence: missing.map((path) => display(inventory, path)),
      affectedPaths: [record.sourcePath, ...missing],
      sourceScopes: [],
      availableFixes: [],
      limitations: ["只解析显式本地路径引用，不跟踪远程 URL 或动态生成路径。"],
    });
  }
  return findings;
}

function riskyDeclarations(inventory: Inventory): Finding[] {
  const findings: Finding[] = [];
  const groups = new Map<string, { label: string; sourcePath: string; declarations: CapabilityDeclaration[]; record?: FixableRecord }>();
  const add = (key: string, label: string, sourcePath: string, declarations: CapabilityDeclaration[], record?: FixableRecord): void => {
    const existing = groups.get(key);
    if (existing) existing.declarations.push(...declarations);
    else groups.set(key, { label, sourcePath, declarations: [...declarations], ...(record ? { record } : {}) });
  };
  for (const skill of active(inventory.skills)) if (skill.capabilities.length) add(skill.id, `Skill ${skill.name}`, skill.path, skill.capabilities, skill);
  for (const hook of inventory.hooks.filter((item) => item.enabled)) if (hook.capabilities.length) add(hook.id, `Hook ${hook.event}`, hook.path, hook.capabilities, hook);
  for (const [key, group] of groups) {
    const kinds = [...new Set(group.declarations.map((item) => item.kind))];
    findings.push({
      id: findingId("risky-declaration", [key, ...kinds]),
      checkId: "risky-declaration",
      title: `宽泛能力声明：${group.label}`,
      detail: "发现 shell、网络、密钥或文件系统相关声明；请确认这是你主动启用的能力。",
      severity: kinds.includes("secret") || kinds.includes("shell") ? "high" : "medium",
      confidence: "medium",
      evidence: group.declarations.slice(0, 4).map((item) => `${item.kind} · ${truncate(item.evidence, 100)}${item.line ? `:${item.line}` : ""}`),
      affectedPaths: [group.sourcePath],
      sourceScopes: group.record ? [group.record.source.scope] : [],
      availableFixes: group.record ? [disableFix(group.record)].filter((fix): fix is Fix => Boolean(fix)) : [],
      limitations: ["这是文本声明检测，不代表代码已执行，也不证明存在漏洞。"],
    });
  }
  return findings;
}

function instructionOverlap(inventory: Inventory): Finding[] {
  const findings: Finding[] = [];
  const rulesByKey = groupBy(
    inventory.instructions.flatMap((instruction) => instruction.deterministicRules.map((rule) => ({ instruction, rule }))),
    (item) => item.rule.key,
  );
  for (const [key, entries] of rulesByKey) {
    const values = new Set(entries.map((entry) => entry.rule.value));
    if (values.size < 2) continue;
    findings.push({
      id: findingId("instruction-overlap", [key, ...entries.map((entry) => entry.instruction.id)]),
      checkId: "instruction-overlap",
      title: `指令冲突：${key}`,
      detail: "多个生效指令文件对同一可识别规则给出了不同值。",
      severity: "medium",
      confidence: "medium",
      evidence: entries.map(({ instruction, rule }) => `${rule.value} · ${display(inventory, instruction.path)}:${rule.line}`),
      affectedPaths: entries.map((entry) => entry.instruction.path),
      sourceScopes: [...new Set(entries.map((entry) => entry.instruction.scope))],
      availableFixes: [],
      limitations: ["只识别少量确定性规则；自然语言冲突与语义优先级不处理。"],
    });
  }
  return findings;
}

function unusedCapabilities(inventory: Inventory): Finding[] {
  const findings: Finding[] = [];
  const candidates = activeMcps(inventory.mcps).filter((mcp) => mcp.environmentKeys.some((key) => /(?:TOKEN|SECRET|PASSWORD|KEY|CREDENTIAL|AUTH)/i.test(key)));
  if (candidates.length < 5) return findings;
  findings.push({
    id: findingId("unused-capability", candidates.map((item) => item.id)),
    checkId: "unused-capability",
    title: "较多能力可能未使用",
    detail: "当前启用了多个带环境配置的 MCP；本工具没有可靠使用信号，因此只提示人工确认。",
    severity: "low",
    confidence: "medium",
    evidence: candidates.slice(0, 6).map((item) => item.name),
    affectedPaths: [],
    sourceScopes: [],
    availableFixes: [],
    limitations: ["没有读取会话使用历史，不将“未使用”当作事实。"],
  });
  return findings;
}

export async function runChecks(inventory: Inventory): Promise<Finding[]> {
  const batches = await Promise.all([
    duplicateSkills(inventory),
    shadowedSkills(inventory),
    staleMcpCommands(inventory),
    duplicateMcps(inventory),
    missingReferences(inventory),
  ]);
  const findings = [
    ...batches.flat(),
    ...riskyDeclarations(inventory),
    ...instructionOverlap(inventory),
    ...unusedCapabilities(inventory),
  ];
  const severityWeight = { high: 0, medium: 1, low: 2 } as const;
  return findings.sort((left, right) => {
    const severity = severityWeight[left.severity] - severityWeight[right.severity];
    if (severity !== 0) return severity;
    return left.id.localeCompare(right.id);
  });
}

export function summarizeScopes(inventory: Inventory): string {
  return scopeList(inventory.hosts.map((host) => host.name));
}

export function ruleLabel(rule: DeterministicRule): string {
  return `${rule.key}=${rule.value}`;
}

export function findFix(inventory: Inventory, fixId: string): Fix | undefined {
  return inventoryFindingsCache.get(inventory)?.flatMap((finding) => finding.availableFixes).find((fix) => fix.id === fixId);
}

const inventoryFindingsCache = new WeakMap<Inventory, Finding[]>();

export function cacheFindings(inventory: Inventory, findings: Finding[]): void {
  inventoryFindingsCache.set(inventory, findings);
}

export function resolvePotentialFile(value: string, sourcePath: string, home: string): string {
  return value.startsWith("~/") ? resolve(home, value.slice(2)) : resolve(dirname(sourcePath), value);
}

export function allFixIds(findings: Finding[]): string[] {
  const selected = new Set<string>();
  for (const finding of findings) {
    for (const fix of finding.availableFixes) {
      if (finding.checkId === "skill-shadowing") continue;
      selected.add(fix.id);
    }
  }
  return [...selected];
}
