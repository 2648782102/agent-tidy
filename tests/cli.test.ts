import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

function fixtureArgs(fixture: { root: string }): string[] {
  return ["--home", `${fixture.root}/home`, "--cwd", `${fixture.root}/project`, "--data-dir", `${fixture.root}/data`];
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
  const result = run(["scan", "--json", "--no-report", ...fixtureArgs(fixture)]);
  assert.equal(result.code, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.version, "0.1.0");
  assert.ok(Array.isArray(parsed.findings));
});

test("CLI JSON apply writes a reversible transaction without leaking config bytes", async () => {
  const fixture = await createFixture();
  const configPath = await writeFixtureFile(fixture.root, "home/.codex/config.toml", codexConfig());
  const original = await readFile(configPath);
  const args = fixtureArgs(fixture);
  const fixed = run(["fix", "--json", "--no-report", "all", ...args]);
  assert.equal(fixed.code, 0, fixed.stderr);
  const plan = JSON.parse(fixed.stdout);
  assert.equal(plan.applied, false);
  assert.doesNotMatch(fixed.stdout, /afterBytesBase64|bytesBase64|do-not-print/);
  assert.deepEqual(await readFile(configPath), original);

  const applied = run(["apply", "--json", "--no-report", "all", ...args]);
  assert.equal(applied.code, 0, applied.stderr);
  const transaction = JSON.parse(applied.stdout);
  assert.equal(transaction.applied, true);
  assert.equal(transaction.status, "applied");
  assert.doesNotMatch(applied.stdout, /afterBytesBase64|bytesBase64|do-not-print/);
  assert.match(await readFile(configPath, "utf8"), /\[disabled\.mcp_servers\.broken\]/);

  const undone = run(["undo", "--json", "--no-report", transaction.id, ...args]);
  assert.equal(undone.code, 0, undone.stderr);
  assert.equal(JSON.parse(undone.stdout).status, "undone");
  assert.doesNotMatch(undone.stdout, /afterBytesBase64|bytesBase64|do-not-print/);
  assert.deepEqual(await readFile(configPath), original);
});
