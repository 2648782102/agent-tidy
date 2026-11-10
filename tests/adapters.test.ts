import assert from "node:assert/strict";
import { test } from "node:test";
import { buildInventory } from "../src/adapters/index.js";
import { codexConfig, createFixture, skillMarkdown, writeFixtureFile } from "./helpers.js";

test("Codex adapter discovers config, skills, plugins and MCP servers", async () => {
  const fixture = await createFixture();
  await writeFixtureFile(fixture.root, "home/.codex/config.toml", codexConfig());
  await writeFixtureFile(fixture.root, "home/.codex/skills/demo/SKILL.md", skillMarkdown("demo-skill", "A demo skill"));
  await writeFixtureFile(fixture.root, "project/AGENTS.md", "Run npm test\nNever git commit\n");

  const inventory = await buildInventory(fixture.roots);

  assert.equal(inventory.hosts.length, 2);
  assert.equal(inventory.mcps.filter((mcp) => mcp.source.host === "codex").length, 2);
  assert.equal(inventory.skills.filter((skill) => skill.source.host === "codex").length, 1);
  assert.equal(inventory.instructions.length, 1);
  assert.ok(inventory.instructions[0]?.deterministicRules.length);
  assert.ok(inventory.inspectedPaths.some((path) => path.endsWith("config.toml")));
});

test("adapters redact environment values and keep only key names", async () => {
  const fixture = await createFixture();
  await writeFixtureFile(fixture.root, "home/.claude/settings.json", JSON.stringify({
    mcpServers: { secure: { command: "node", env: { API_KEY: "super-secret-value" } } },
  }, null, 2));

  const inventory = await buildInventory(fixture.roots);
  const mcp = inventory.mcps.find((item) => item.name === "secure");

  assert.deepEqual(mcp?.environmentKeys, ["API_KEY"]);
  assert.equal(JSON.stringify(inventory).includes("super-secret-value"), false);
});
