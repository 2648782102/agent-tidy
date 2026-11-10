import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildInventory } from "../src/adapters/index.js";
import { allFixIds, runChecks } from "../src/checks.js";
import { applyPlan, buildChangePlan, undoTransaction } from "../src/fixes.js";
import { createFixture, skillMarkdown, writeFixtureFile } from "./helpers.js";

test("a copied or fallback Codex config scans, fixes, and undoes without touching the source", async () => {
  const source = join(process.env.HOME ?? "", ".codex/config.toml");
  const sourceExists = await stat(source).then(() => true, () => false);
  const copyRoot = await mkdtemp(join(tmpdir(), "agent-tidy-real-copy-"));
  const copyPath = join(copyRoot, "config.toml");
  if (sourceExists) await copyFile(source, copyPath);
  else await writeFile(copyPath, '[mcp_servers.smoke]\ncommand = "node"\nargs = ["server.js"]\n', "utf8");
  const sourceBytes = await readFile(source).catch(() => undefined);
  const copyBytes = await readFile(copyPath);
  const fixture = await createFixture();
  await mkdir(join(fixture.roots.codexHome ?? "", "skills"), { recursive: true });
  const configPath = await writeFixtureFile(fixture.root, "home/.codex/config.toml", copyBytes.toString("utf8"));
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
  assert.deepEqual(await readFile(configPath), copyBytes);
  assert.deepEqual(await readFile(copyPath), copyBytes);
  if (sourceExists && sourceBytes) assert.deepEqual(await readFile(source), sourceBytes);
  else await assert.rejects(stat(source));
});
