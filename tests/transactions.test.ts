import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { buildInventory } from "../src/adapters/index.js";
import { allFixIds, runChecks } from "../src/checks.js";
import { applyPlan, buildChangePlan, listTransactions, loadTransaction, showTransaction, undoTransaction } from "../src/fixes.js";
import { codexConfig, createFixture, writeFixtureFile } from "./helpers.js";
import { skillMarkdown } from "./helpers.js";

test("apply and undo restore exact bytes and permissions", async () => {
  const fixture = await createFixture();
  const configPath = await writeFixtureFile(fixture.root, "home/.codex/config.toml", codexConfig());
  const original = await readFile(configPath);
  const inventory = await buildInventory(fixture.roots);
  const findings = await runChecks(inventory);
  const stale = findings.find((finding) => finding.checkId === "stale-mcp");
  assert.ok(stale);
  const ids = stale.availableFixes.map((fix) => fix.id);
  assert.ok(ids.length > 0);

  const plan = await buildChangePlan(inventory, findings, ids);
  const transaction = await applyPlan(inventory, plan, "test fix");
  assert.equal(transaction.status, "applied");
  const changed = await readFile(configPath, "utf8");
  assert.match(changed, /\[disabled\.mcp_servers\.broken\]/);

  const undone = await undoTransaction(fixture.roots, transaction.id);
  assert.equal(undone.status, "undone");
  assert.deepEqual(await readFile(configPath), original);
  assert.equal((await listTransactions(fixture.roots))[0]?.status, "undone");
});

test("apply refuses when target changed after scan", async () => {
  const fixture = await createFixture();
  const configPath = await writeFixtureFile(fixture.root, "home/.codex/config.toml", codexConfig());
  const inventory = await buildInventory(fixture.roots);
  const findings = await runChecks(inventory);
  const plan = await buildChangePlan(inventory, findings, allFixIds(findings));
  await writeFixtureFile(fixture.root, "home/.codex/config.toml", `${await readFile(configPath, "utf8")}\n# changed\n`);
  await assert.rejects(applyPlan(inventory, plan, "should fail"), /变化|修改/);
});

test("transaction show includes redacted outcome", async () => {
  const fixture = await createFixture();
  await writeFixtureFile(fixture.root, "home/.codex/config.toml", codexConfig());
  const inventory = await buildInventory(fixture.roots);
  const findings = await runChecks(inventory);
  const plan = await buildChangePlan(inventory, findings, allFixIds(findings));
  const transaction = await applyPlan(inventory, plan, "test fix");
  const shown = await showTransaction(fixture.roots, transaction.id);
  assert.match(shown, new RegExp(transaction.id));
  assert.ok(await loadTransaction(fixture.roots, transaction.id.slice(0, 8)));
});

test("undo removes the disabled directory after a skill rename", async () => {
  const fixture = await createFixture();
  await writeFixtureFile(fixture.root, "home/.codex/skills/demo-a/SKILL.md", skillMarkdown("duplicate", "first"));
  await writeFixtureFile(fixture.root, "home/.codex/skills/demo-b/SKILL.md", skillMarkdown("duplicate", "second"));
  const inventory = await buildInventory(fixture.roots);
  const findings = await runChecks(inventory);
  const plan = await buildChangePlan(inventory, findings, allFixIds(findings));
  const transaction = await applyPlan(inventory, plan, "disable duplicate");
  await undoTransaction(fixture.roots, transaction.id);
  const disabledPath = join(fixture.roots.codexHome ?? "", "skills/.demo-b.agent-tidy-disabled");
  await assert.rejects(stat(disabledPath));
  assert.equal((await stat(join(fixture.roots.codexHome ?? "", "skills/demo-b/SKILL.md"))).isFile(), true);
});
