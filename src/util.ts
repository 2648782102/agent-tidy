import { createHash } from "node:crypto";
import {
  constants as fsConstants,
  createReadStream,
  createWriteStream,
} from "node:fs";
import { access, copyFile, lstat, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import type { CapabilityDeclaration, SourceLocation } from "./types.js";

export const AGENT_TIDY_VERSION = "0.1.0";

export function hashBytes(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function truncate(value: string, max = 160): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max - 1)}…`;
}

export function redact(value: string): string {
  return value
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1<redacted>")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{16,}|AKIA[A-Z0-9]{12,})\b/g, "<redacted>")
    .replace(/\b([A-Za-z0-9_.-]*(?:TOKEN|SECRET|PASSWORD|API_KEY|AUTHORIZATION)[A-Za-z0-9_.-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1=<redacted>");
}

export function displayPath(path: string, roots: { home: string; cwd: string }): string {
  const homeRelative = relative(roots.home, path);
  if (!homeRelative.startsWith("..") && !isAbsolute(homeRelative)) return `~/${homeRelative}`;
  const cwdRelative = relative(roots.cwd, path);
  if (!cwdRelative.startsWith("..") && !isAbsolute(cwdRelative)) return `./${cwdRelative}`;
  return path;
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export async function readTextSafe(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

export async function readJsonSafe<T>(path: string): Promise<T | undefined> {
  const text = await readTextSafe(path);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

export async function listDirectories(root: string): Promise<string[]> {
  if (!(await isDirectory(root))) return [];
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => resolve(root, entry.name)).sort();
}

export async function listFiles(root: string, maxDepth = 2): Promise<string[]> {
  const result: string[] = [];
  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > maxDepth || !(await isDirectory(directory))) return;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isFile()) result.push(path);
      else if (entry.isDirectory() && !entry.name.startsWith(".")) await walk(path, depth + 1);
    }
  }
  await walk(root, 0);
  return result.sort();
}

export function findLine(text: string, needle: string): number | undefined {
  const index = text.indexOf(needle);
  if (index < 0) return undefined;
  return text.slice(0, index).split("\n").length;
}

export function sourceLocation(path: string, text: string, needle: string, field?: string): SourceLocation {
  const line = findLine(text, needle);
  return line === undefined ? { path, ...(field ? { field } : {}) } : { path, line, ...(field ? { field } : {}) };
}

const CAPABILITY_PATTERNS: Array<{ kind: CapabilityDeclaration["kind"]; pattern: RegExp }> = [
  {
    kind: "shell",
    pattern: /(?:^|\s)(?:allowed[-_ ]?tools|permissions?|command|run|exec|bash|sh -c|shell|subprocess|child_process|os\.system)\s*[:=]\s*(?:\S|["'])/i,
  },
  {
    kind: "network",
    pattern: /(?:^|\s)(?:network|web access|http[s]?|url|endpoint|curl|wget|fetch)\s*[:=]\s*(?:\S|["'])/i,
  },
  {
    kind: "secret",
    pattern: /(?:^|\s)(?:secrets?|(?:auth|access|api|bearer)[_-]?tokens?|passwords?|credentials?|api[_ -]?keys?|private keys?|\.env|env vars?|environment variables?)\s*(?:[:=]|access|read|write|use)/i,
  },
  {
    kind: "filesystem",
    pattern: /(?:^|\s)(?:filesystem|file (?:read|write|delete)|write (?:access|outside|to)|delete|remove|rm -rf|chmod|root directory|home directory)\s*(?:[:=]|(?:outside|to|from|in|access))/i,
  },
];

export function detectCapabilities(text: string, path: string): CapabilityDeclaration[] {
  const declarations: CapabilityDeclaration[] = [];
  const lines = text.split("\n");
  const frontmatterEnd = /^---\r?\n/.test(text) ? text.split(/\r?\n/).findIndex((line, index) => index > 0 && line.trim() === "---") : -1;
  const codeFenceLines = new Set<number>();
  let insideFence = false;
  lines.forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      insideFence = !insideFence;
      codeFenceLines.add(index + 1);
      return;
    }
    if (insideFence) codeFenceLines.add(index + 1);
  });
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const lineNumber = index + 1;
    const inFrontmatter = frontmatterEnd >= 0 && lineNumber <= frontmatterEnd + 1;
    const structured = inFrontmatter || /^[ \t]*[|>`*-]/.test(line) || /^[ \t]*[A-Za-z0-9_.-]+\s*[:=]/.test(line) || codeFenceLines.has(lineNumber);
    if (!structured) continue;
    for (const { kind, pattern } of CAPABILITY_PATTERNS) {
      if (!pattern.test(line)) continue;
      declarations.push({
        kind,
        evidence: redact(truncate(line.trim(), 120)),
        path,
        line: lineNumber,
      });
    }
  }
  return declarations.slice(0, 8);
}

export function parseFrontmatter(text: string): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const rawLine of (match[1] ?? "").split(/\r?\n/)) {
    const separator = rawLine.indexOf(":");
    if (separator < 0) continue;
    const key = rawLine.slice(0, separator).trim();
    const value = rawLine.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key) result[key] = value;
  }
  return result;
}

export function extractPathReferences(text: string): string[] {
  const references = new Set<string>();
  const patterns = [
    /@([~./A-Za-z0-9_\- /]+\.[A-Za-z0-9]+)/g,
    /\[[^\]]*\]\(([^)]+\.[A-Za-z0-9]+(?:#[^)]*)?)\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = (match[1] ?? "").split("#")[0]?.trim();
      if (value) references.add(value);
    }
  }
  return [...references].slice(0, 32);
}

export function resolveReference(reference: string, fromFile: string, home: string): string {
  const expanded = reference.startsWith("~/") ? resolve(home, reference.slice(2)) : reference;
  return isAbsolute(expanded) ? expanded : resolve(dirname(fromFile), expanded);
}

export async function commandExists(command: string): Promise<boolean> {
  if (!command) return false;
  if (command.includes("/")) return pathExists(command);
  const pathValue = process.env.PATH ?? "";
  for (const entry of pathValue.split(":")) {
    if (!entry) continue;
    if (await pathExists(resolve(entry, command))) return true;
  }
  return false;
}

export function executableFromArgs(command: string | undefined, args: string[]): string | undefined {
  if (!command) return undefined;
  return command;
}

export function stableId(prefix: string, parts: Array<string | number | undefined>): string {
  return `${prefix}-${hashBytes(parts.map((part) => part ?? "").join("\u0000")).slice(0, 10)}`;
}

export async function atomicWrite(path: string, bytes: Uint8Array | string, mode?: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.agent-tidy-${process.pid}-${Date.now()}.tmp`;
  await writeFile(temporary, bytes, { mode: mode ?? 0o600 });
  try {
    await copyFile(temporary, path);
  } finally {
    const { rm } = await import("node:fs/promises");
    await rm(temporary, { force: true });
  }
  if (mode !== undefined) {
    const { chmod } = await import("node:fs/promises");
    await chmod(path, mode);
  }
}

export async function fileSnapshot(path: string): Promise<{
  existed: boolean;
  bytes?: Uint8Array;
  mode?: number;
  symlinkTarget?: string;
  hash?: string;
}> {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink()) {
      const { readlink } = await import("node:fs/promises");
      return { existed: true, symlinkTarget: await readlink(path) };
    }
    if (!info.isFile()) return { existed: true, mode: info.mode };
    const bytes = await readFile(path);
    return { existed: true, bytes, mode: info.mode, hash: hashBytes(bytes) };
  } catch {
    return { existed: false };
  }
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
}

export async function copyStream(source: string, destination: string): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  await pipeline(createReadStream(source), createWriteStream(destination));
}
