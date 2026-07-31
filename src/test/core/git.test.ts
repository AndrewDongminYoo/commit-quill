import * as assert from "node:assert";
import { afterEach, test } from "mocha";

import { defaultSnapshotLimits, inspectRepository } from "../../core/git";
import { GitFixture } from "../helpers/git-fixture";

const fixtures: GitFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.dispose()));
});

async function createFixture(): Promise<GitFixture> {
  const fixture = await GitFixture.create();
  fixtures.push(fixture);
  return fixture;
}

test("classifies a repository with no changes as clean", async () => {
  const fixture = await createFixture();

  const snapshot = await inspectRepository(fixture.repositoryPath);

  assert.deepStrictEqual(snapshot, { kind: "clean" });
});

test("prefers staged changes over unstaged changes", async () => {
  const fixture = await createFixture();
  await fixture.write("README.md", "staged\n");
  await fixture.stage("README.md");
  await fixture.write("notes.md", "unstaged\n");

  const snapshot = await inspectRepository(fixture.repositoryPath);

  assert.strictEqual(snapshot.kind, "staged");
  assert.deepStrictEqual(snapshot.files, ["README.md"]);
  assert.match(snapshot.diff, /staged/);
});

test("includes untracked files in an unstaged snapshot", async () => {
  const fixture = await createFixture();
  await fixture.write("notes.md", "unstaged\n");

  const snapshot = await inspectRepository(fixture.repositoryPath);

  assert.strictEqual(snapshot.kind, "unstaged");
  assert.deepStrictEqual(snapshot.files, ["notes.md"]);
  assert.match(snapshot.diff, /unstaged/);
});

test("enumerates files inside an untracked directory", async () => {
  const fixture = await createFixture();
  await fixture.writeIn("pkg/nested", "note.md", "fresh\n");

  const snapshot = await inspectRepository(fixture.repositoryPath);

  assert.strictEqual(snapshot.kind, "unstaged");
  assert.deepStrictEqual(snapshot.files, ["pkg/nested/note.md"]);
  assert.match(snapshot.diff, /fresh/);
});

test("omits untracked binary content but still names the file", async () => {
  const fixture = await createFixture();
  await fixture.writeBytes("logo.png", Buffer.from([0x89, 0x50, 0x00, 0x1a]));

  const snapshot = await inspectRepository(fixture.repositoryPath);

  assert.strictEqual(snapshot.kind, "unstaged");
  assert.match(snapshot.diff, /logo\.png/);
  assert.match(snapshot.diff, /new binary file/);
  assert.deepStrictEqual(snapshot.notices, [
    "Content omitted for 1 file(s): logo.png.",
  ]);
});

test("truncates an oversized diff and says so", async () => {
  const fixture = await createFixture();
  await fixture.write("notes.md", "x".repeat(5000));

  const snapshot = await inspectRepository(fixture.repositoryPath, {
    ...defaultSnapshotLimits,
    maxDiffCharacters: 1000,
  });

  assert.strictEqual(snapshot.kind, "unstaged");
  assert.ok(snapshot.diff.length < 1200);
  assert.match(snapshot.diff, /diff truncated at 1000 characters/);
  assert.deepStrictEqual(snapshot.notices, [
    "The diff was truncated to 1000 characters, so later changes were not sent.",
  ]);
});

test("reports a staged rename without polluting the stageable path list", async () => {
  const fixture = await createFixture();
  await fixture.output(["mv", "README.md", "GUIDE.md"]);

  const snapshot = await inspectRepository(fixture.repositoryPath);

  assert.strictEqual(snapshot.kind, "staged");
  // Only the destination is a path `git add` can take.
  assert.deepStrictEqual(snapshot.files, ["GUIDE.md"]);
  assert.deepStrictEqual(snapshot.renames, [
    { from: "README.md", to: "GUIDE.md" },
  ]);
});

test("leaves renames empty when nothing was renamed", async () => {
  const fixture = await createFixture();
  await fixture.write("notes.md", "unstaged\n");

  const snapshot = await inspectRepository(fixture.repositoryPath);

  assert.strictEqual(snapshot.kind, "unstaged");
  assert.deepStrictEqual(snapshot.renames, []);
});

test("summarises a lockfile instead of sending its contents", async () => {
  const fixture = await createFixture();
  await fixture.write("package-lock.json", `${"noise\n".repeat(400)}`);
  await fixture.write("src.ts", "export const real = 1;\n");
  await fixture.stage("package-lock.json");
  await fixture.stage("src.ts");

  const snapshot = await inspectRepository(fixture.repositoryPath);

  assert.strictEqual(snapshot.kind, "staged");
  // The lockfile is named and counted, but its 400 lines never reach the model.
  assert.doesNotMatch(snapshot.diff, /noise/);
  assert.match(snapshot.diff, /package-lock\.json \(\+400 -0\)/);
  assert.match(snapshot.diff, /export const real/);
  // It still has to appear as a changed file, or a split could not stage it.
  assert.ok(snapshot.files.includes("package-lock.json"));
  assert.deepStrictEqual(snapshot.notices, [
    "Summarised 1 generated file(s) instead of sending their contents.",
  ]);
});

test("omits the contents of an untracked lockfile too", async () => {
  const fixture = await createFixture();
  await fixture.write("yarn.lock", `${"noise\n".repeat(400)}`);

  const snapshot = await inspectRepository(fixture.repositoryPath);

  assert.strictEqual(snapshot.kind, "unstaged");
  assert.doesNotMatch(snapshot.diff, /noise/);
  assert.match(snapshot.diff, /new generated file/);
  assert.ok(snapshot.files.includes("yarn.lock"));
});

test("keeps a lockfile's contents when nothing is collapsed", async () => {
  const fixture = await createFixture();
  await fixture.write("package-lock.json", "noise\n");
  await fixture.stage("package-lock.json");

  const snapshot = await inspectRepository(fixture.repositoryPath, {
    ...defaultSnapshotLimits,
    collapsedPaths: [],
  });

  assert.strictEqual(snapshot.kind, "staged");
  assert.match(snapshot.diff, /noise/);
  assert.deepStrictEqual(snapshot.notices, []);
});
