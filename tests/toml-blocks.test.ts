import assert from "node:assert/strict";
import { test } from "node:test";
import { disableTomlBlock, splitTomlBlocks } from "../src/adapters/toml-blocks.js";

test("TOML block disabling preserves nested environment blocks", () => {
  const text = [
    "[mcp_servers.demo]",
    'command = "node"',
    "",
    "[mcp_servers.demo.env]",
    'TOKEN = "secret"',
    "",
    "[other]",
    "value = 1",
  ].join("\n");
  const blocks = splitTomlBlocks(text);
  const result = disableTomlBlock(text, blocks[0]!);
  assert.match(result, /\[disabled\.mcp_servers\.demo\]/);
  assert.match(result, /\[mcp_servers\.demo\.env\]/);
  assert.match(result, /\[other\]/);
});
