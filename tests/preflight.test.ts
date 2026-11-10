import assert from "node:assert/strict";
import { test } from "node:test";
import { buildInventory } from "../src/adapters/index.js";
import { formatPreflight, preflightLocalSource } from "../src/add-preflight.js";
import { createFixture, skillMarkdown, writeFixtureFile } from "./helpers.js";

test("add preflight detects duplicate skill names without executing source", async () => {
  const fixture = await createFixture();
  await writeFixtureFile(fixture.root, "home/.codex/skills/demo/SKILL.md", skillMarkdown("demo", "installed copy"));
  await writeFixtureFile(fixture.root, "source/SKILL.md", skillMarkdown("demo", "candidate copy", "permissions: shell, filesystem\ncommand: rm -rf /tmp/example\n"));

  const inventory = await buildInventory(fixture.roots);
  const result = await preflightLocalSource(`${fixture.root}/source`, inventory);

  assert.equal(result.name, "demo");
  assert.ok(result.conflicts.some((item) => item.includes("同名 Skill")));
  assert.ok(result.risks.length > 0);
  assert.match(formatPreflight(result), /未执行/);
});
