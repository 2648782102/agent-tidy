#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { formatPreflight, preflightLocalSource } from "./add-preflight.js";
import { adapterVersions, buildInventory, formatInspectedPath } from "./adapters/index.js";
import { allFixIds, cacheFindings, findFix, runChecks } from "./checks.js";
import {
  applyPlan,
  listTransactions,
  loadTransaction,
  planFromIds,
  readPlanArtifact,
  showTransaction,
  transactionSummary,
  undoTransaction,
  writePlanArtifact,
} from "./fixes.js";
import { writeReport } from "./report.js";
import type { Finding, Inventory, Roots, ScanResult } from "./types.js";
import { AGENT_TIDY_VERSION, displayPath, redact, truncate } from "./util.js";

interface Options {
  json: boolean;
  home?: string;
  cwd?: string;
  dataDir?: string;
  codexHome?: string;
  claudeHome?: string;
  report: boolean;
  yes: boolean;
  verbose: boolean;
}

const HELP = `agent-tidy ${AGENT_TIDY_VERSION}

用法:
  agent-tidy                         扫描；如有发现问题，进入交互式修复
  agent-tidy scan                    只读扫描，默认生成可打开报告
  agent-tidy explain <id>            解释某个 finding / 配置项来源
  agent-tidy fix [id...|all]         生成修复计划；默认显示 diff，不写入
  agent-tidy apply [id...|all]       预览并显式应用修复
  agent-tidy diff                    显示待应用修复计划
  agent-tidy history                 列出本地事务
  agent-tidy show [transaction]      查看事务记录
  agent-tidy undo [transaction]      撤销最近或指定事务
  agent-tidy add <local-dir>         安装前预检本地 Skill / 插件源
  agent-tidy report                  只生成 HTML 报告
  agent-tidy hosts                   显示 adapter 与检查范围

通用参数:
  --json                           机器可读输出
  --no-report                     不写 HTML 报告
  --home <dir>                    覆盖 HOME（测试用）
  --cwd <dir>                     覆盖当前目录（测试用）
  --data-dir <dir>                覆盖本地事务目录
  --codex-home <dir>              覆盖 CODEX_HOME
  --claude-home <dir>             覆盖 Claude Code 用户目录
  --yes                           跳过交互式确认（apply 仍要求命令显式执行）
  --verbose                       显示更多限制说明
  -h, --help                      显示帮助
`;

function parseOptions(argv: string[]): { command: string; args: string[]; options: Options } {
  const options: Options = { json: false, report: true, yes: false, verbose: false };
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? "";
    if (argument === "--help" || argument === "-h") positionals.push("help");
    else if (argument === "--json") options.json = true;
    else if (argument === "--no-report") options.report = false;
    else if (argument === "--yes" || argument === "-y") options.yes = true;
    else if (argument === "--verbose" || argument === "-v") options.verbose = true;
    else if (["--home", "--cwd", "--data-dir", "--codex-home", "--claude-home"].includes(argument)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} 缺少参数`);
      index += 1;
      if (argument === "--home") options.home = resolve(value);
      if (argument === "--cwd") options.cwd = resolve(value);
      if (argument === "--data-dir") options.dataDir = resolve(value);
      if (argument === "--codex-home") options.codexHome = resolve(value);
      if (argument === "--claude-home") options.claudeHome = resolve(value);
    } else if (argument.startsWith("-")) throw new Error(`未知参数：${argument}`);
    else positionals.push(argument);
  }
  const command = positionals[0] ?? "scan";
  return { command, args: positionals.slice(1), options };
}

function rootsFromOptions(options: Options): Roots {
  const home = options.home ?? homedir();
  const cwd = options.cwd ?? process.cwd();
  const dataDir = options.dataDir ?? resolve(home, ".local", "share", "agent-tidy");
  return {
    home,
    cwd,
    ...(options.codexHome ? { codexHome: options.codexHome } : {}),
    ...(options.claudeHome ? { claudeHome: options.claudeHome } : {}),
    dataDir,
  };
}

async function scan(options: Options): Promise<ScanResult> {
  const inventory = await buildInventory(rootsFromOptions(options));
  const findings = await runChecks(inventory);
  cacheFindings(inventory, findings);
  return { inventory, findings };
}

function severityLabel(severity: Finding["severity"]): string {
  return severity === "high" ? "高" : severity === "medium" ? "中" : "低";
}

function formatScanText(result: ScanResult, options: Options): string {
  const { inventory, findings } = result;
  if (findings.length === 0) {
    return `OK：已检查 ${inventory.inspectedPaths.length} 个路径 · ${inventory.hosts.length} 个 host · 没有发现高置信、可操作的问题`;
  }
  const lines = [`发现 ${findings.length} 项可处理问题 · ${inventory.hosts.length} 个 host · ${inventory.inspectedPaths.length} 个路径`];
  for (const [index, finding] of findings.entries()) {
    lines.push(`${index + 1}. [${severityLabel(finding.severity)}/${finding.confidence}] ${finding.id}`);
    lines.push(`   ${finding.title} · ${truncate(finding.detail, 120)}`);
    for (const evidence of finding.evidence.slice(0, 3)) lines.push(`   - ${redact(truncate(evidence, 160))}`);
    if (finding.availableFixes.length) lines.push(`   可修复：${finding.availableFixes.map((fix) => fix.id).join(", ")}`);
    if (options.verbose) for (const limitation of finding.limitations) lines.push(`   限制：${limitation}`);
  }
  if (inventory.unsupported.length) lines.push(`未解析项：${inventory.unsupported.length}；运行 explain 或查看报告了解详情`);
  return lines.join("\n");
}

function scanJson(result: ScanResult, reportPath?: string): unknown {
  return {
    version: AGENT_TIDY_VERSION,
    findings: result.findings,
    hosts: result.inventory.hosts,
    inspectedPaths: result.inventory.inspectedPaths,
    unsupported: result.inventory.unsupported,
    ...(reportPath ? { reportPath } : {}),
  };
}

async function generateReport(result: ScanResult, options: Options): Promise<string | undefined> {
  if (!options.report || options.json) return undefined;
  return writeReport(result.inventory, result.findings, await loadTransaction(result.inventory.roots));
}

async function ask(question: string): Promise<string> {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await readline.question(question)).trim();
  } finally {
    readline.close();
  }
}

async function confirm(question: string, options: Options): Promise<boolean> {
  if (options.yes) return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const answer = await ask(`${question} [y/N] `);
  return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
}

function resolveFixIds(result: ScanResult, args: string[]): string[] {
  if (args.length === 0 || args.includes("all")) return allFixIds(result.findings);
  const selected = new Set<string>();
  for (const argument of args) {
    const finding = result.findings.find((item) => item.id === argument || item.id.startsWith(argument));
    if (finding) {
      for (const fix of finding.availableFixes) selected.add(fix.id);
      continue;
    }
    if (findFix(result.inventory, argument)) selected.add(argument);
    else throw new Error(`找不到 finding 或 fix：${argument}`);
  }
  return [...selected];
}

async function commandScan(args: string[], options: Options): Promise<number> {
  void args;
  const result = await scan(options);
  const reportPath = await generateReport(result, options);
  if (options.json) console.log(JSON.stringify(scanJson(result, reportPath), null, 2));
  else {
    console.log(formatScanText(result, options));
    if (reportPath) console.log(`报告：${reportPath}`);
  }
  return 0;
}

async function commandReport(options: Options): Promise<number> {
  const result = await scan({ ...options, report: false });
  const path = await writeReport(result.inventory, result.findings, await loadTransaction(result.inventory.roots));
  if (options.json) console.log(JSON.stringify({ reportPath: path, findings: result.findings.length }, null, 2));
  else console.log(path);
  return 0;
}

async function commandExplain(args: string[], options: Options): Promise<number> {
  const target = args[0];
  if (!target) throw new Error("用法：agent-tidy explain <finding-id|path>");
  const result = await scan({ ...options, report: false });
  const finding = result.findings.find((item) => item.id === target || item.id.startsWith(target));
  const lines: string[] = [];
  if (finding) {
    lines.push(`Finding：${finding.id}`, finding.title, finding.detail, `检查器：${finding.checkId}`, `置信度：${finding.confidence}`);
    lines.push("证据：", ...finding.evidence.map((item) => `- ${redact(item)}`));
    lines.push("限制：", ...finding.limitations.map((item) => `- ${item}`));
  }
  for (const record of [
    ...result.inventory.skills,
    ...result.inventory.mcps,
    ...result.inventory.hooks,
    ...result.inventory.plugins,
    ...result.inventory.instructions,
  ]) {
    if (!record.id.startsWith(target) && !record.source.location.path.includes(target)) continue;
    lines.push(`来源：${record.id}`, `Host：${record.source.host}`, `范围：${record.source.scope}`, `标签：${record.source.label}`, `文件：${displayPath(record.source.location.path, result.inventory.roots)}${record.source.location.line ? `:${record.source.location.line}` : ""}`);
  }
  if (lines.length === 0) lines.push(`没有匹配到 finding 或 inventory 项：${target}`);
  console.log(lines.join("\n"));
  return 0;
}

async function commandFix(args: string[], options: Options, apply: boolean): Promise<number> {
  const result = await scan({ ...options, report: false });
  const ids = resolveFixIds(result, args);
  const { plan, diff } = await planFromIds(result.inventory, result.findings, ids);
  const pendingPath = await writePlanArtifact(result.inventory.roots, plan);
  if (options.json) {
    console.log(JSON.stringify({ planId: plan.id, selectedFixIds: plan.selectedFixIds, changes: plan.changes, diff, pendingPath, applied: false }, null, 2));
    return 0;
  }
  console.log(`修复计划 ${plan.id} · ${transactionSummary(plan)}`);
  console.log(redact(diff));
  console.log(`待应用计划：${pendingPath}`);
  if (!apply) {
    console.log("未写入用户配置。确认后运行：agent-tidy apply --yes <id...|all>");
    return 0;
  }
  const confirmed = await confirm(`确认应用 ${plan.changes.length} 个变更？`, options);
  if (!confirmed) {
    console.log("已取消，没有写入用户配置。");
    return 1;
  }
  const transaction = await applyPlan(result.inventory, plan, transactionSummary(plan));
  console.log(`已应用事务 ${transaction.id}；撤销：agent-tidy undo ${transaction.id}`);
  return 0;
}

async function commandDiff(options: Options): Promise<number> {
  const roots = rootsFromOptions(options);
  const result = await scan({ ...options, report: false });
  const plan = await readPlanArtifact(roots);
  if (!plan) {
    console.log("没有待应用修复计划。");
    return 0;
  }
  const { renderPlanDiffs } = await import("./fixes.js");
  console.log(await renderPlanDiffs(plan));
  void result;
  return 0;
}

async function commandHistory(options: Options): Promise<number> {
  const roots = rootsFromOptions(options);
  const transactions = await listTransactions(roots);
  if (options.json) console.log(JSON.stringify(transactions.map(({ snapshots, ...transaction }) => transaction), null, 2));
  else if (transactions.length === 0) console.log("没有本地事务。");
  else for (const transaction of transactions) console.log(`${transaction.id}\t${transaction.createdAt}\t${transaction.status}\t${transaction.summary}`);
  return 0;
}

async function commandShow(args: string[], options: Options): Promise<number> {
  const roots = rootsFromOptions(options);
  console.log(await showTransaction(roots, args[0]));
  return 0;
}

async function commandUndo(args: string[], options: Options): Promise<number> {
  const roots = rootsFromOptions(options);
  const transaction = await undoTransaction(roots, args[0]);
  if (options.json) console.log(JSON.stringify({ ...transaction, snapshots: undefined }, null, 2));
  else console.log(`已撤销事务 ${transaction.id}，恢复 ${transaction.snapshots.length} 个路径。`);
  return 0;
}

async function commandAdd(args: string[], options: Options): Promise<number> {
  const source = args[0];
  if (!source) throw new Error("用法：agent-tidy add <local-dir>");
  const result = await scan({ ...options, report: false });
  const preflight = await preflightLocalSource(source, result.inventory);
  if (options.json) console.log(JSON.stringify(preflight, null, 2));
  else console.log(formatPreflight(preflight));
  return 0;
}

async function commandHosts(options: Options): Promise<number> {
  const inventory = await buildInventory(rootsFromOptions(options));
  if (options.json) console.log(JSON.stringify({ hosts: inventory.hosts, inspectedPaths: inventory.inspectedPaths, adapterVersions: adapterVersions(inventory), unsupported: inventory.unsupported }, null, 2));
  else {
    for (const host of inventory.hosts) console.log(`${host.name} · adapter ${host.adapterVersion} · ${host.supported ? "supported" : "unsupported"}`);
    for (const path of inventory.inspectedPaths) console.log(`- ${formatInspectedPath(path, inventory.roots)}`);
  }
  return 0;
}

async function commandDefault(options: Options): Promise<number> {
  const result = await scan(options);
  const reportPath = await generateReport(result, options);
  console.log(formatScanText(result, options));
  if (reportPath) console.log(`报告：${reportPath}`);
  if (result.findings.length === 0 || result.findings.every((finding) => finding.availableFixes.length === 0)) return 0;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log("非交互终端：运行 agent-tidy fix all 查看修复 diff。");
    return 0;
  }
  const answer = await ask("输入 finding 编号或 fix ID 生成修复计划，a=全部，q=退出：");
  if (answer === "q" || answer === "") return 0;
  const ids = answer === "a" ? ["all"] : answer.split(/\s+/);
  return commandFix(ids, { ...options, report: false }, false);
}

async function main(): Promise<number> {
  const { command, args, options } = parseOptions(process.argv.slice(2));
  switch (command) {
    case "help": console.log(HELP); return 0;
    case "version": console.log(AGENT_TIDY_VERSION); return 0;
    case "scan": return commandScan(args, options);
    case "report": return commandReport(options);
    case "explain": return commandExplain(args, options);
    case "fix": return commandFix(args, options, false);
    case "apply": return commandFix(args, options, true);
    case "diff": return commandDiff(options);
    case "history": return commandHistory(options);
    case "show": return commandShow(args, options);
    case "undo": return commandUndo(args, options);
    case "add": return commandAdd(args, options);
    case "hosts": return commandHosts(options);
    case "": return commandDefault(options);
    default:
      if (command === "scan") return commandScan(args, options);
      console.error(`未知命令：${command}\n\n${HELP}`);
      return 2;
  }
}

main().then((code) => { process.exitCode = code; }).catch((error: unknown) => {
  console.error(`agent-tidy: ${redact(error instanceof Error ? error.message : String(error))}`);
  process.exitCode = 1;
});
