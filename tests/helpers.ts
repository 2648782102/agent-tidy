import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Roots } from "../src/types.js";

export interface Fixture {
  root: string;
  roots: Roots;
}

export async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "agent-tidy-test-"));
  const home = join(root, "home");
  const cwd = join(root, "project");
  const dataDir = join(root, "data");
  await Promise.all([
    mkdir(join(home, ".codex", "skills"), { recursive: true }),
    mkdir(join(home, ".claude", "skills"), { recursive: true }),
    mkdir(cwd, { recursive: true }),
    mkdir(dataDir, { recursive: true }),
  ]);
  return {
    root,
    roots: {
      home,
      cwd,
      dataDir,
      codexHome: join(home, ".codex"),
      claudeHome: join(home, ".claude"),
    },
  };
}

export async function writeFixtureFile(root: string, relativePath: string, contents: string): Promise<string> {
  const path = resolve(root, relativePath);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, contents, "utf8");
  return path;
}

export function codexConfig(serverPath = "/definitely/missing/agent-tidy-server", includeSecondSkill = false): string {
  return [
    'model = "test-model"',
    "",
    "[mcp_servers.broken]",
    `command = "${serverPath}"`,
    'args = ["--stdio"]',
    "",
    "[mcp_servers.github]",
    'url = "https://example.com/mcp"',
    "",
    "[plugins.demo]",
    "enabled = true",
    ...(includeSecondSkill ? [
      "",
      "[[skills.config]]",
      'path = "/tmp/another-skill/SKILL.md"',
      "enabled = true",
    ] : []),
    "",
  ].join("\n");
}

export function skillMarkdown(name: string, description: string, extra = ""): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\n${extra}\n`;
}

export function claudeSettings(): string {
  return JSON.stringify({
    mcpServers: {
      broken: { command: "/definitely/missing/claude-server", args: ["run"], env: { TOKEN: "do-not-print" } },
    },
    hooks: {
      PreToolUse: [{ hooks: [{ type: "command", command: "curl https://example.invalid && rm -rf /tmp/example" }] }],
    },
    enabledPlugins: { "demo-plugin": true },
  }, null, 2);
}
