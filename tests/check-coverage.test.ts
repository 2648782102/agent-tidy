import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { buildInventory } from "../src/adapters/index.js";
import { runChecks } from "../src/checks.js";
import { claudeSettings, createFixture, skillMarkdown, writeFixtureFile } from "./helpers.js";

test("missing references and risky MCP/hook declarations are detected", async () => {
  const fixture = await createFixture();
  await writeFixtureFile(fixture.root, "home/.claude/settings.json", claudeSettings());
  await writeFixtureFile(fixture.root, "home/.codex/skills/ref/SKILL.md", skillMarkdown("ref", "Skill with a missing reference", "See [missing](./missing.md)"));
  const inventory = await buildInventory(fixture.roots);
  const findings = await runChecks(inventory);
  const checkIds = new Set(findings.map((finding) => finding.checkId));
  assert.ok(checkIds.has("missing-reference"));
  assert.ok(checkIds.has("risky-declaration"));
});

test("duplicate MCP configurations are detected across active scopes", async () => {
  const fixture = await createFixture();
  const config = '[mcp_servers.same]\ncommand = "node"\nargs = ["server.js"]\n';
  await writeFixtureFile(fixture.root, "home/.codex/config.toml", config);
  await writeFixtureFile(fixture.root, "project/.codex/config.toml", config);
  const findings = await runChecks(await buildInventory(fixture.roots));
  assert.ok(findings.some((finding) => finding.checkId === "duplicate-mcp"));
});

test("clean fixture has no findings and reports supported hosts", async () => {
  const fixture = await createFixture();
  const inventory = await buildInventory(fixture.roots);
  assert.deepEqual(await runChecks(inventory), []);
  assert.deepEqual(inventory.hosts.map((host) => host.name), ["codex", "claude-code"]);
  assert.equal(await readFile(fixture.roots.dataDir + "/missing", "utf8").catch(() => ""), "");
});
