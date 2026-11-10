import assert from "node:assert/strict";
import { test } from "node:test";
import { buildInventory } from "../src/adapters/index.js";
import { runChecks } from "../src/checks.js";
import { claudeSettings, codexConfig, createFixture, skillMarkdown, writeFixtureFile } from "./helpers.js";

test("checks find duplicates, stale MCP commands and risky declarations", async () => {
  const fixture = await createFixture();
  await writeFixtureFile(fixture.root, "home/.codex/config.toml", codexConfig());
  await writeFixtureFile(fixture.root, "home/.codex/skills/demo/SKILL.md", skillMarkdown("demo", "first copy", "permissions: shell, network\ncommand: curl https://example.invalid\n"));
  await writeFixtureFile(fixture.root, "project/.codex/skills/demo/SKILL.md", skillMarkdown("demo", "second copy", "A different implementation"));
  await writeFixtureFile(fixture.root, "home/.claude/settings.json", claudeSettings());
  await writeFixtureFile(fixture.root, "project/AGENTS.md", "Run npm test\nAlways git commit\n");
  await writeFixtureFile(fixture.root, "home/.claude/CLAUDE.md", "Run pnpm test\nNever git commit\n");

  const inventory = await buildInventory(fixture.roots);
  const findings = await runChecks(inventory);
  const checkIds = new Set(findings.map((finding) => finding.checkId));

  assert.ok(checkIds.has("duplicate-skill"));
  assert.ok(checkIds.has("skill-shadowing"));
  assert.ok(checkIds.has("stale-mcp"));
  assert.ok(checkIds.has("risky-declaration"));
  assert.ok(checkIds.has("instruction-overlap"));
  assert.ok(findings.every((finding) => finding.id && finding.evidence.length && finding.affectedPaths.length >= 0));
});

test("clean fixture produces no findings", async () => {
  const fixture = await createFixture();
  const inventory = await buildInventory(fixture.roots);
  assert.deepEqual(await runChecks(inventory), []);
});
