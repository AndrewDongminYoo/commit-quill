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

test("recognises Conventional Commits whose type and scope vary", () => {
  // The real shape of a conventional history: no two prefixes are identical,
  // which is exactly what a literal prefix comparison cannot see.
  const subjects = [
    "docs(ai-portfolio): receipt-scanner is now public",
    "chore(plugins): update plugin versions",
    "feat(skills): vendor graph-engineering",
    "fix(codex-review): skip user config on headless reviews",
    "docs(rules): promote three config-repo memories",
  ];

  assert.deepStrictEqual(detectConvention(subjects), {
    kind: "existing",
    examples: subjects,
  });
});

test("recognises a gitmoji convention without scopes", () => {
  const subjects = [
    "chore: ⬆️ bump googleapis dependency",
    "feat: ✨ add receipt export",
    "fix: 🐛 stop the scanner double-firing",
  ];

  assert.deepStrictEqual(detectConvention(subjects), {
    kind: "existing",
    examples: subjects,
  });
});

test("falls back to Conventional Commits for prose subjects", () => {
  assert.deepStrictEqual(
    detectConvention([
      "Update plugin installations and marketplace metadata",
      "Add a new setting",
      "Tweak the release script",
    ]),
    { kind: "conventional" },
  );
});
