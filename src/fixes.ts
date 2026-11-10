import { randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import type {
  FileSnapshot,
  Finding,
  Fix,
  Inventory,
  PlannedChange,
  Roots,
  Transaction,
} from "./types.js";
import { disableTomlBlock, splitTomlBlocks } from "./adapters/toml-blocks.js";
import {
  AGENT_TIDY_VERSION,
  atomicWrite,
  ensureDir,
  fileSnapshot,
  hashBytes,
  pathExists,
  readJsonSafe,
  readTextSafe,
  redact,
} from "./util.js";

interface JsonObject {
  [key: string]: unknown;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function transactionsDir(roots: Roots): string {
  return join(roots.dataDir, "transactions");
}

function transactionPath(roots: Roots, id: string): string {
  return join(transactionsDir(roots), id);
}

function manifestPath(roots: Roots, id: string): string {
  return join(transactionPath(roots, id), "manifest.json");
}

function backupPath(roots: Roots, id: string, index: number): string {
  return join(transactionPath(roots, id), `backup-${index}.bin`);
}

function compactTransaction(transaction: Transaction): Transaction {
  return {
    ...transaction,
    changes: transaction.changes.map(({ afterBytesBase64: _afterBytesBase64, ...change }) => change),
  };
}

async function writeManifest(roots: Roots, transaction: Transaction): Promise<void> {
  await atomicWrite(manifestPath(roots, transaction.id), `${JSON.stringify(compactTransaction(transaction), null, 2)}\n`, 0o600);
}

function decodeBase64(value: string): Buffer {
  return Buffer.from(value, "base64");
}

function encodeBase64(bytes: Uint8Array | string): string {
  return Buffer.from(bytes).toString("base64");
}

function setJsonPath(root: JsonObject, path: string[], value: unknown): boolean {
  let current: JsonObject = root;
  for (const key of path.slice(0, -1)) {
    const next = current[key];
    if (!isJsonObject(next)) return false;
    current = next;
  }
  const last = path.at(-1);
  if (!last) return false;
  current[last] = value;
  return true;
}

function findJsonKeyPath(root: unknown, targetKey: string, path: string[] = []): string[] | undefined {
  if (!isJsonObject(root)) return undefined;
  for (const [key, value] of Object.entries(root)) {
    const nextPath = [...path, key];
    if (key === targetKey) return nextPath;
    const nested = findJsonKeyPath(value, targetKey, nextPath);
    if (nested) return nested;
  }
  return undefined;
}

function quotedTomlName(blockHeader: string): string | undefined {
  const match = /\[(?:mcp_servers|plugins)\.([^\]]+)\]/.exec(blockHeader);
  return match?.[1]?.trim().replace(/^["']|["']$/g, "");
}

async function planSingleFix(fix: Fix, inventory: Inventory, finding: Finding): Promise<PlannedChange[]> {
  const path = fix.targetPath;
  const text = await readTextSafe(path);
  if (text === undefined && fix.kind !== "disable-skill-dir") throw new Error(`目标文件不存在：${path}`);
  const before = await fileSnapshot(path);
  if (!before.existed) throw new Error(`目标路径不存在：${path}`);

  if (fix.kind === "disable-mcp-toml") {
    const blocks = splitTomlBlocks(text ?? "");
    const name = inventory.mcps.find((mcp) => mcp.id === fix.targetId)?.name;
    const block = blocks.find((candidate) => candidate.keyPath[0] === "mcp_servers" && candidate.keyPath[1] === name);
    if (!block) throw new Error(`找不到 TOML 配置块：${name ?? fix.targetId}`);
    const after = disableTomlBlock(text ?? "", block);
    return [{
      path,
      operation: "write-file",
      ...(before.hash ? { beforeHash: before.hash } : {}),
      afterBytesBase64: encodeBase64(after),
      afterHash: hashBytes(after),
      rationale: fix.description,
      findingId: finding.id,
    }];
  }

  if (fix.kind === "disable-mcp-json") {
    const json = await readJsonSafe<JsonObject>(path);
    if (!json) throw new Error(`无法解析 JSON：${path}`);
    const name = inventory.mcps.find((mcp) => mcp.id === fix.targetId)?.name;
    const keyPath = name ? findJsonKeyPath(json, name) : undefined;
    const parentPath = keyPath?.slice(0, -1) ?? [];
    let current: unknown = json;
    for (const key of parentPath) current = isJsonObject(current) ? current[key] : undefined;
    if (!isJsonObject(current) || !name || !isJsonObject(current[name])) throw new Error(`找不到 MCP 配置：${name ?? fix.targetId}`);
    current[name] = { ...current[name], disabled: true };
    const after = `${JSON.stringify(json, null, 2)}\n`;
    return [{
      path,
      operation: "write-file",
      ...(before.hash ? { beforeHash: before.hash } : {}),
      afterBytesBase64: encodeBase64(after),
      afterHash: hashBytes(after),
      rationale: fix.description,
      findingId: finding.id,
    }];
  }

  if (fix.kind === "disable-plugin-toml") {
    const after = (text ?? "").replace(/^(\s*enabled\s*=\s*)true\b/m, "$1false");
    if (after === text) throw new Error(`未找到可禁用的插件开关：${path}`);
    return [{
      path,
      operation: "write-file",
      ...(before.hash ? { beforeHash: before.hash } : {}),
      afterBytesBase64: encodeBase64(after),
      afterHash: hashBytes(after),
      rationale: fix.description,
      findingId: finding.id,
    }];
  }

  if (fix.kind === "disable-plugin-json") {
    const json = await readJsonSafe<JsonObject>(path);
    if (!json) throw new Error(`无法解析 JSON：${path}`);
    const name = inventory.plugins.find((plugin) => plugin.id === fix.targetId)?.name;
    const keyPath = name ? findJsonKeyPath(json, name) : undefined;
    if (!setJsonPath(json, keyPath ?? [], false)) throw new Error(`无法禁用插件：${name ?? fix.targetId}`);
    const after = `${JSON.stringify(json, null, 2)}\n`;
    return [{
      path,
      operation: "write-file",
      ...(before.hash ? { beforeHash: before.hash } : {}),
      afterBytesBase64: encodeBase64(after),
      afterHash: hashBytes(after),
      rationale: fix.description,
      findingId: finding.id,
    }];
  }

  if (fix.kind === "disable-skill-dir") {
    if (before.symlinkTarget) throw new Error("拒绝重命名符号链接目录");
    const parent = dirname(path);
    const name = basename(path);
    const destination = resolve(parent, `.${name}.agent-tidy-disabled`);
    if (await pathExists(destination)) throw new Error(`禁用目标已存在：${destination}`);
    return [{
      path,
      operation: "rename-path",
      renameTo: destination,
      ...(before.hash ? { beforeHash: before.hash } : {}),
      rationale: fix.description,
      findingId: finding.id,
    }];
  }

  throw new Error(`不支持的修复类型：${fix.kind}`);
}

export interface ChangePlan {
  id: string;
  changes: PlannedChange[];
  snapshots: FileSnapshot[];
  selectedFixIds: string[];
  findingIds: string[];
}

export async function buildChangePlan(inventory: Inventory, findings: Finding[], fixIds: string[]): Promise<ChangePlan> {
  const selected = new Set(fixIds);
  const targets: Array<{ finding: Finding; fix: Fix }> = [];
  for (const finding of findings) {
    for (const fix of finding.availableFixes) if (selected.has(fix.id) || selected.has(finding.id) || selected.has("all")) targets.push({ finding, fix });
  }
  if (targets.length === 0) throw new Error("没有选中的修复项");

  const changesByPath = new Map<string, PlannedChange>();
  for (const target of targets) {
    const changes = await planSingleFix(target.fix, inventory, target.finding);
    for (const change of changes) {
      const existing = changesByPath.get(change.path);
      if (existing) {
        const equivalent = existing.operation === change.operation
          && existing.renameTo === change.renameTo
          && existing.afterHash === change.afterHash
          && existing.afterBytesBase64 === change.afterBytesBase64;
        if (!equivalent) throw new Error(`同一路径存在冲突修复：${change.path}`);
        continue;
      }
      changesByPath.set(change.path, change);
    }
  }

  const changes = [...changesByPath.values()];
  const snapshots: FileSnapshot[] = [];
  for (const [index, change] of changes.entries()) {
    const snapshot = await fileSnapshot(change.path);
    const record: FileSnapshot = {
      path: change.path,
      existed: snapshot.existed,
      ...(snapshot.bytes ? { bytesBase64: encodeBase64(snapshot.bytes) } : {}),
      ...(snapshot.mode !== undefined ? { mode: snapshot.mode } : {}),
      ...(snapshot.symlinkTarget ? { symlinkTarget: snapshot.symlinkTarget } : {}),
      ...(snapshot.hash ? { hash: snapshot.hash } : {}),
      ...(change.operation === "rename-path" || snapshot.symlinkTarget !== undefined ? { isDirectory: true } : {}),
      ...(change.renameTo ? { renamedTo: change.renameTo } : {}),
    };
    snapshots.push(record);
    void index;
  }

  return {
    id: randomUUID(),
    changes,
    snapshots,
    selectedFixIds: targets.map((target) => target.fix.id),
    findingIds: [...new Set(targets.map((target) => target.finding.id))],
  };
}

export function unifiedDiff(path: string, before: string, after: string): string {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const lines = [`--- ${path}`, `+++ ${path}`];
  const max = Math.max(beforeLines.length, afterLines.length);
  for (let index = 0; index < max; index += 1) {
    const beforeLine = beforeLines[index];
    const afterLine = afterLines[index];
    if (beforeLine === afterLine) continue;
    if (beforeLine !== undefined) lines.push(`-${redact(beforeLine)}`);
    if (afterLine !== undefined) lines.push(`+${redact(afterLine)}`);
  }
  return lines.join("\n");
}

export async function renderPlanDiffs(plan: ChangePlan): Promise<string> {
  const outputs: string[] = [];
  for (const change of plan.changes) {
    if (change.operation === "rename-path") {
      outputs.push(`${change.path} -> ${change.renameTo ?? "<rename>"}\n  ${change.rationale}`);
      continue;
    }
    const beforeBytes = plan.snapshots.find((snapshot) => snapshot.path === change.path)?.bytesBase64;
    const before = beforeBytes ? decodeBase64(beforeBytes).toString("utf8") : "";
    const after = change.afterBytesBase64 ? decodeBase64(change.afterBytesBase64).toString("utf8") : "";
    outputs.push(unifiedDiff(change.path, before, after));
  }
  return outputs.join("\n\n");
}

async function verifyBeforeApply(plan: ChangePlan): Promise<void> {
  for (const change of plan.changes) {
    const snapshot = plan.snapshots.find((item) => item.path === change.path);
    const current = await fileSnapshot(change.path);
    if (!snapshot?.existed || !current.existed) throw new Error(`目标在扫描后发生变化：${change.path}`);
    if (snapshot.hash && current.hash !== snapshot.hash) throw new Error(`目标在扫描后被修改：${change.path}`);
    if (snapshot.symlinkTarget && current.symlinkTarget !== snapshot.symlinkTarget) throw new Error(`符号链接在扫描后发生变化：${change.path}`);
    if (change.renameTo && await pathExists(change.renameTo)) throw new Error(`重命名目标已存在：${change.renameTo}`);
  }
}

async function restoreSnapshot(snapshot: FileSnapshot, roots: Roots, transactionId: string): Promise<void> {
  const path = snapshot.path;
  if (!snapshot.existed) {
    await rm(path, { recursive: true, force: true });
    return;
  }
  if (snapshot.renamedTo && await pathExists(snapshot.renamedTo)) {
    if (await pathExists(path)) await rm(path, { recursive: true, force: true });
    await rename(snapshot.renamedTo, path);
    return;
  }
  if (snapshot.renamedTo && await pathExists(path)) {
    await rm(snapshot.renamedTo, { recursive: true, force: true });
    return;
  }
  if (snapshot.symlinkTarget) {
    await rm(path, { recursive: true, force: true });
    const { symlink } = await import("node:fs/promises");
    await symlink(snapshot.symlinkTarget, path);
    return;
  }
  if (snapshot.bytesBase64) {
    await atomicWrite(path, decodeBase64(snapshot.bytesBase64), snapshot.mode);
    return;
  }
  if (snapshot.backupPath) {
    const bytes = await readFile(join(transactionPath(roots, transactionId), basename(snapshot.backupPath)), "utf8").catch(() => undefined);
    if (bytes !== undefined) await atomicWrite(path, bytes, snapshot.mode);
  }
}

async function backupDirectory(path: string, destination: string): Promise<void> {
  await ensureDir(destination);
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    const source = join(path, entry.name);
    const target = join(destination, entry.name);
    if (entry.isDirectory()) await backupDirectory(source, target);
    else if (entry.isFile()) await atomicWrite(target, await readFile(source));
  }
}

async function restoreDirectory(source: string, target: string): Promise<void> {
  await ensureDir(target);
  await ensureDir(target);
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = join(source, entry.name);
    const targetPath = join(target, entry.name);
    if (entry.isDirectory()) await restoreDirectory(sourcePath, targetPath);
    else if (entry.isFile()) await atomicWrite(targetPath, await readFile(sourcePath));
  }
}

export async function applyPlan(inventory: Inventory, plan: ChangePlan, summary: string): Promise<Transaction> {
  const roots = inventory.roots;
  const id = plan.id;
  await ensureDir(transactionPath(roots, id));
  const snapshots = plan.snapshots.map((snapshot, index) => ({
    ...snapshot,
    ...(snapshot.isDirectory && snapshot.existed ? { backupPath: backupPath(roots, id, index) } : {}),
  }));
  for (const [index, snapshot] of snapshots.entries()) {
    if (!snapshot.backupPath) continue;
    await backupDirectory(snapshot.path, snapshot.backupPath);
    void index;
  }

  const transaction: Transaction = {
    id,
    createdAt: new Date().toISOString(),
    toolVersion: AGENT_TIDY_VERSION,
    adapterVersions: Object.fromEntries(inventory.hosts.map((host) => [host.name, host.adapterVersion])),
    status: "failed",
    summary,
    changes: plan.changes,
    snapshots,
  };
  await writeManifest(roots, transaction);

  const applied: string[] = [];
  try {
    await verifyBeforeApply(plan);
    for (const change of plan.changes) {
      if (change.operation === "rename-path") {
        if (!change.renameTo) throw new Error("缺少重命名目标");
        await rename(change.path, change.renameTo);
        applied.push(change.path);
        continue;
      }
      if (!change.afterBytesBase64) throw new Error("缺少目标文件内容");
      await atomicWrite(change.path, decodeBase64(change.afterBytesBase64));
      applied.push(change.path);
    }
    for (const change of plan.changes) {
      if (change.operation !== "write-file" || !change.afterHash) continue;
      const bytes = await readFile(change.path);
      if (hashBytes(bytes) !== change.afterHash) throw new Error(`写入校验失败：${change.path}`);
    }
    transaction.status = "applied";
    transaction.outcome = `已应用 ${plan.changes.length} 个变更`;
    await writeManifest(roots, transaction);
    return transaction;
  } catch (error) {
    for (const path of applied.reverse()) {
      const snapshot = snapshots.find((item) => item.path === path);
      if (snapshot) await restoreSnapshot(snapshot, roots, id);
    }
    transaction.status = "failed";
    transaction.outcome = redact(error instanceof Error ? error.message : String(error));
    await writeManifest(roots, transaction);
    throw error;
  }
}

export async function listTransactions(roots: Roots): Promise<Transaction[]> {
  const root = transactionsDir(roots);
  if (!(await pathExists(root))) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const manifests = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => readJsonSafe<Transaction>(join(root, entry.name, "manifest.json"))));
  return manifests.filter((item): item is Transaction => Boolean(item)).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function loadTransaction(roots: Roots, id?: string): Promise<Transaction | undefined> {
  const transactions = await listTransactions(roots);
  return id ? transactions.find((item) => item.id === id || item.id.startsWith(id)) : transactions[0];
}

export async function undoTransaction(roots: Roots, id?: string): Promise<Transaction> {
  const transaction = await loadTransaction(roots, id);
  if (!transaction) throw new Error("没有可撤销的事务");
  if (transaction.status === "undone") throw new Error("该事务已经撤销");
  for (const snapshot of transaction.snapshots) {
    if (snapshot.backupPath) await restoreDirectory(snapshot.backupPath, snapshot.path);
    else await restoreSnapshot(snapshot, roots, transaction.id);
    if (snapshot.renamedTo) await rm(snapshot.renamedTo, { recursive: true, force: true });
  }
  transaction.status = "undone";
  transaction.outcome = "已恢复事务前的本地状态";
  await writeManifest(roots, transaction);
  return transaction;
}

export async function showTransaction(roots: Roots, id?: string): Promise<string> {
  const transaction = await loadTransaction(roots, id);
  if (!transaction) return "没有本地事务。";
  const lines = [
    `事务 ${transaction.id}`,
    `时间：${transaction.createdAt}`,
    `状态：${transaction.status}`,
    `摘要：${transaction.summary}`,
    `变更：${transaction.changes.length}`,
  ];
  for (const change of transaction.changes) {
    lines.push(`- ${change.path} · ${change.operation} · ${change.rationale}`);
  }
  return redact(lines.join("\n"));
}

export async function planFromIds(inventory: Inventory, findings: Finding[], ids: string[]): Promise<{ plan: ChangePlan; diff: string }> {
  const plan = await buildChangePlan(inventory, findings, ids);
  return { plan, diff: await renderPlanDiffs(plan) };
}

export function transactionSummary(plan: ChangePlan): string {
  return `修复 ${plan.selectedFixIds.length} 项，涉及 ${plan.changes.length} 个路径`;
}

export async function writePlanArtifact(roots: Roots, plan: ChangePlan): Promise<string> {
  const path = join(roots.dataDir, "pending-plan.json");
  await atomicWrite(path, `${JSON.stringify({ ...plan, createdAt: new Date().toISOString() }, null, 2)}\n`, 0o600);
  return path;
}

export async function readPlanArtifact(roots: Roots): Promise<ChangePlan | undefined> {
  const path = join(roots.dataDir, "pending-plan.json");
  return readJsonSafe<ChangePlan>(path);
}

export async function writeFileSafe(path: string, contents: string): Promise<void> {
  await writeFile(path, contents);
}
