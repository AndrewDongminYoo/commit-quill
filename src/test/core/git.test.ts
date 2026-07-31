import * as assert from "node:assert";
import { afterEach, test } from "mocha";

import { inspectRepository } from "../../core/git";
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
