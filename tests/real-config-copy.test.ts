import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildInventory } from "../src/adapters/index.js";
import { allFixIds, runChecks } from "../src/checks.js";
import { applyPlan, buildChangePlan, undoTransaction } from "../src/fixes.js";
import { createFixture, skillMarkdown, writeFixtureFile } from "./helpers.js";

test("a copied shape of a real Codex config scans, fixes, and undoes without touching the original", async () => {
  const source = join(process.env.HOME ?? "", ".codex/config.toml");
  const copyRoot = await mkdtemp(join(tmpdir(), "agent-tidy-real-copy-"));
  const copyPath = join(copyRoot, "config.toml");
  await copyFile(source, copyPath);
  const fixture = await createFixture();
  await mkdir(join(fixture.roots.codexHome ?? "", "skills"), { recursive: true });
  await writeFixtureFile(fixture.root, "home/.codex/config.toml", await (await import("node:fs/promises")).readFile(copyPath, "utf8"));
  await writeFixtureFile(fixture.root, "home/.codex/skills/demo-a/SKILL.md", skillMarkdown("duplicate", "first"));
  await writeFixtureFile(fixture.root, "home/.codex/skills/demo-b/SKILL.md", skillMarkdown("duplicate", "second"));

  const inventory = await buildInventory(fixture.roots);
  assert.ok(inventory.inspectedPaths.some((path) => path.endsWith("config.toml")));
  const findings = await runChecks(inventory);
  assert.ok(findings.length > 0);
  const plan = await buildChangePlan(inventory, findings, allFixIds(findings));
  const transaction = await applyPlan(inventory, plan, "copied real config smoke");
  assert.equal(transaction.status, "applied");
  await undoTransaction(fixture.roots, transaction.id);
  assert.equal((await readFile(copyPath, "utf8")).includes("[mcp_servers"), true);
  assert.equal((await readFile(source, "utf8")).includes("[mcp_servers"), true);
});

async function readFile(path: string, encoding: BufferEncoding): Promise<string> {
  return (await import("node:fs/promises")).readFile(path, encoding);
}
