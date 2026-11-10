import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { buildInventory } from "../src/adapters/index.js";
import { allFixIds, runChecks } from "../src/checks.js";
import { buildChangePlan } from "../src/fixes.js";
import { codexConfig, createFixture, skillMarkdown, writeFixtureFile } from "./helpers.js";

test("fix all keeps one duplicate skill copy and one duplicate MCP copy", async () => {
  const fixture = await createFixture();
  await writeFixtureFile(fixture.root, "home/.codex/config.toml", codexConfig());
  await writeFixtureFile(fixture.root, "home/.codex/skills/demo-a/SKILL.md", skillMarkdown("duplicate", "first"));
  await writeFixtureFile(fixture.root, "home/.codex/skills/demo-b/SKILL.md", skillMarkdown("duplicate", "second"));
  const inventory = await buildInventory(fixture.roots);
  const findings = await runChecks(inventory);
  const plan = await buildChangePlan(inventory, findings, allFixIds(findings));
  const skillRenames = plan.changes.filter((change) => change.operation === "rename-path");
  const configChanges = plan.changes.filter((change) => change.path.endsWith("config.toml"));
  assert.equal(skillRenames.length, 1);
  assert.equal(configChanges.length, 1);
});

test("disabled skill directories are ignored by discovery and preserved", async () => {
  const fixture = await createFixture();
  await writeFixtureFile(fixture.root, "home/.codex/skills/.hidden.agent-tidy-disabled/SKILL.md", skillMarkdown("hidden", "should not be active"));
  const inventory = await buildInventory(fixture.roots);
  assert.equal(inventory.skills.length, 0);
  const disabledPath = join(fixture.roots.codexHome ?? "", "skills/.hidden.agent-tidy-disabled/SKILL.md");
  assert.equal((await readFile(disabledPath, "utf8")).includes("hidden"), true);
});
