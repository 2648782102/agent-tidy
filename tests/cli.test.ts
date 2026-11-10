import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { resolve } from "node:path";
import { codexConfig, createFixture, skillMarkdown, writeFixtureFile } from "./helpers.js";

const projectRoot = resolve(import.meta.dirname, "..");
const cli = resolve(projectRoot, "src/cli.ts");

function cliArgs(args: string[]): string[] {
  return ["--import", "tsx", cli, ...args];
}

function run(args: string[]): { code: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, cliArgs(args), { encoding: "utf8", cwd: projectRoot });
  return { code: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}


test("CLI help and version work", () => {
  assert.match(run(["--help"]).stdout, /agent-tidy/);
  assert.match(run(["version"]).stdout, /0\.1\.0/);
});

test("CLI scan works against fixture and writes a report", async () => {
  const fixture = await createFixture();
  await writeFixtureFile(fixture.root, "home/.codex/config.toml", codexConfig());
  await writeFixtureFile(fixture.root, "home/.codex/skills/demo/SKILL.md", skillMarkdown("demo", "demo skill"));
  const args = ["scan", "--home", `${fixture.root}/home`, "--cwd", `${fixture.root}/project`, "--data-dir", `${fixture.root}/data`];
  const result = run(args);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /报告：/);
  assert.doesNotMatch(result.stdout, /super-secret/);
});

test("CLI JSON output is parseable", async () => {
  const fixture = await createFixture();
  const result = run(["scan", "--json", "--no-report", "--home", `${fixture.root}/home`, "--cwd", `${fixture.root}/project`, "--data-dir", `${fixture.root}/data`]);
  assert.equal(result.code, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.version, "0.1.0");
  assert.ok(Array.isArray(parsed.findings));
});
