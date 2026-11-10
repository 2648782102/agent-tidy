import assert from "node:assert/strict";
import { test } from "node:test";
import { buildInventory } from "../src/adapters/index.js";
import { runChecks } from "../src/checks.js";
import { createFixture, skillMarkdown, writeFixtureFile } from "./helpers.js";

test("unused capability hint appears only for many secret-bearing MCP configs", async () => {
  const fixture = await createFixture();
  const serverNames = ["one", "two", "three", "four", "five"];
  const config = serverNames.map((name) => `[mcp_servers.${name}]\ncommand = "node"\n\n[mcp_servers.${name}.env]\nAPI_TOKEN = "not-real"\n`).join("\n");
  await writeFixtureFile(fixture.root, "home/.codex/config.toml", config);
  const lowSignal = await runChecks(await buildInventory(fixture.roots));
  assert.ok(lowSignal.some((finding) => finding.checkId === "unused-capability"));
});

test("instruction overlap and missing references have explicit limits", async () => {
  const fixture = await createFixture();
  await writeFixtureFile(fixture.root, "project/AGENTS.md", "Run npm test\nSee [missing](./missing.md)\n");
  await writeFixtureFile(fixture.root, "home/.claude/CLAUDE.md", "Run pnpm test\n");
  const findings = await runChecks(await buildInventory(fixture.roots));
  for (const checkId of ["instruction-overlap", "missing-reference"]) {
    const finding = findings.find((item) => item.checkId === checkId);
    assert.ok(finding);
    assert.ok(finding.limitations.length > 0);
  }
  void skillMarkdown;
});
