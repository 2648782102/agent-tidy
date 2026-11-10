import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Finding, Inventory, Transaction } from "./types.js";
import { displayPath, redact, truncate } from "./util.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderReportHtml(inventory: Inventory, findings: Finding[], lastTransaction?: Transaction): string {
  const findingCards = findings.length
    ? findings.map((finding) => `
      <article class="card ${escapeHtml(finding.severity)}">
        <div class="meta"><span>${escapeHtml(finding.checkId)}</span><span>${escapeHtml(finding.severity)} / ${escapeHtml(finding.confidence)}</span></div>
        <h3>${escapeHtml(finding.title)}</h3>
        <p>${escapeHtml(finding.detail)}</p>
        <ul>${finding.evidence.slice(0, 6).map((item) => `<li>${escapeHtml(redact(truncate(item, 220)))}</li>`).join("")}</ul>
        <p class="fix">${finding.availableFixes.length ? `可修复：${escapeHtml(finding.availableFixes.map((fix) => fix.label).join("、"))}` : "仅提示，无自动修复"}</p>
      </article>`).join("")
    : `<article class="empty">没有发现高置信、可操作的问题。</article>`;
  const inspected = inventory.inspectedPaths.map((path) => `<li>${escapeHtml(displayPath(path, inventory.roots))}</li>`).join("");
  const unsupported = inventory.unsupported.map((item) => `<li>${escapeHtml(redact(item.reason))} · ${escapeHtml(displayPath(item.path, inventory.roots))}</li>`).join("");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>agent-tidy 扫描结果</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f6f7f9; color: #182026; }
    main { max-width: 920px; margin: 0 auto; padding: 40px 24px 64px; }
    header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
    h1 { font-size: 28px; margin: 0; letter-spacing: -0.02em; }
    .summary { color: #5c6873; }
    .grid { display: grid; gap: 14px; }
    .card { background: white; border: 1px solid #dfe4ea; border-radius: 14px; padding: 18px 20px; box-shadow: 0 1px 3px rgba(0,0,0,.04); }
    .card.high { border-left: 4px solid #d54848; }
    .card.medium { border-left: 4px solid #d29226; }
    .card.low { border-left: 4px solid #718096; }
    .meta { display: flex; justify-content: space-between; color: #697784; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
    h3 { margin: 10px 0 6px; font-size: 18px; }
    p { margin: 6px 0; line-height: 1.55; }
    ul { margin: 8px 0; padding-left: 20px; color: #4b5763; font-size: 14px; }
    .fix { color: #1d6d52; font-size: 14px; }
    .empty { padding: 28px; background: white; border-radius: 14px; border: 1px solid #dfe4ea; text-align: center; }
    details { margin-top: 24px; background: white; border: 1px solid #dfe4ea; border-radius: 14px; padding: 14px 20px; }
    summary { cursor: pointer; font-weight: 600; }
    code { background: #edf0f3; padding: 1px 4px; border-radius: 4px; }
    @media (prefers-color-scheme: dark) { body { background: #15191e; color: #e8edf2; } .card, .empty, details { background: #1d232a; border-color: #343d47; } .summary, .meta, ul, p { color: #aab5bf; } code { background: #2b333c; } }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>agent-tidy 扫描结果</h1>
      <div class="summary">${findings.length} 项发现 · ${inventory.inspectedPaths.length} 个路径</div>
    </header>
    <p class="summary">只读报告；没有自动修改配置。${lastTransaction ? ` 最近事务：<code>${escapeHtml(lastTransaction.id)}</code>（${escapeHtml(lastTransaction.status)}）。` : ""}</p>
    <section class="grid">${findingCards}</section>
    <details><summary>已检查路径</summary><ul>${inspected || "<li>无</li>"}</ul></details>
    <details><summary>未解析项</summary><ul>${unsupported || "<li>无</li>"}</ul></details>
  </main>
</body>
</html>`;
}

export async function writeReport(inventory: Inventory, findings: Finding[], lastTransaction?: Transaction): Promise<string> {
  await mkdir(inventory.roots.dataDir, { recursive: true, mode: 0o700 });
  const path = join(inventory.roots.dataDir, "latest-report.html");
  await writeFile(path, renderReportHtml(inventory, findings, lastTransaction), { mode: 0o600 });
  return path;
}
