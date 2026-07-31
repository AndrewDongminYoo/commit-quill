import * as assert from "node:assert";
import { test } from "mocha";

import { detectConvention } from "../../core/convention";

test("uses Conventional Commit guidance when subjects have no stable convention", () => {
  const convention = detectConvention([]);

  assert.deepStrictEqual(convention, { kind: "conventional" });
});

test("preserves a stable existing convention", () => {
  const convention = detectConvention([
    "[mobile] add home tab",
    "[mobile] fix empty state",
    "[mobile] update release notes",
  ]);

  assert.deepStrictEqual(convention, {
    kind: "existing",
    examples: [
      "[mobile] add home tab",
      "[mobile] fix empty state",
      "[mobile] update release notes",
    ],
  });
});
