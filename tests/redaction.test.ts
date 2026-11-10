import assert from "node:assert/strict";
import { test } from "node:test";
import { detectCapabilities } from "../src/util.js";

test("capability detection ignores ordinary design-token language", () => {
  const capabilities = detectCapabilities("- Use semantic color tokens: `text-primary`, not raw hex values\n", "/fixture/SKILL.md");
  assert.deepEqual(capabilities, []);
});

test("capability detection recognizes structured secret and shell declarations", () => {
  const capabilities = detectCapabilities("permissions: shell\napi_token: read\ncommand: curl https://example.invalid\n", "/fixture/SKILL.md");
  const kinds = capabilities.map((item) => item.kind);
  assert.ok(kinds.includes("shell"));
  assert.ok(kinds.includes("secret"));
  assert.ok(kinds.includes("network"));
});
