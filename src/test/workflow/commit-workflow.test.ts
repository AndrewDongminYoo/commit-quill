import * as assert from "node:assert";
import { afterEach, test } from "mocha";

import type { CommitLanguageModel, CommitGroup } from "../../llm/provider";
import {
  CommitWorkflow,
  type CommitUserInterface,
} from "../../workflow/commit-workflow";
import { GitFixture } from "../helpers/git-fixture";

class FakeLanguageModel implements CommitLanguageModel {
  readonly subject: string;
  readonly groups: readonly CommitGroup[];
  requestedSubjects = 0;
  requestedGroups = 0;

  constructor(subject: string, groups: readonly CommitGroup[] = []) {
    this.subject = subject;
    this.groups = groups;
  }

  async generateSubject(): Promise<string> {
    this.requestedSubjects += 1;
    return this.subject;
  }

  async proposeGroups(): Promise<readonly CommitGroup[]> {
    this.requestedGroups += 1;
    return this.groups;
  }
}

class FakeUserInterface implements CommitUserInterface {
  readonly acceptsSplit: boolean;
  readonly subjects: readonly (string | undefined)[];
  information: string | undefined;
  private subjectIndex = 0;

  constructor(
    acceptsSplit: boolean,
    subjects: readonly (string | undefined)[],
  ) {
    this.acceptsSplit = acceptsSplit;
    this.subjects = subjects;
  }

  async showInformation(message: string): Promise<void> {
    this.information = message;
  }

  async confirmSplit(): Promise<boolean> {
    return this.acceptsSplit;
  }

  async editSubject(): Promise<string | undefined> {
    const subject = this.subjects[this.subjectIndex];
    this.subjectIndex += 1;
    return subject;
  }
}

const fixtures: GitFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.dispose()));
});

async function createFixture(): Promise<GitFixture> {
  const fixture = await GitFixture.create();
  fixtures.push(fixture);
  return fixture;
}

test("ends a clean repository workflow without requesting a model response", async () => {
  const fixture = await createFixture();
  const model = new FakeLanguageModel("feat: unreachable");
  const userInterface = new FakeUserInterface(true, []);

  const outcome = await new CommitWorkflow(model, userInterface).run(
    fixture.repositoryPath,
  );

  assert.deepStrictEqual(outcome, { kind: "nothing-to-commit" });
  assert.strictEqual(model.requestedSubjects, 0);
  assert.strictEqual(model.requestedGroups, 0);
  assert.strictEqual(userInterface.information, "Nothing to commit.");
});

test("commits only staged changes after the user confirms the generated subject", async () => {
  const fixture = await createFixture();
  await fixture.write("README.md", "staged\n");
  await fixture.stage("README.md");
  await fixture.write("notes.md", "unstaged\n");
  const model = new FakeLanguageModel("feat: stage one change");

  const outcome = await new CommitWorkflow(
    model,
    new FakeUserInterface(true, ["feat: stage one change"]),
  ).run(fixture.repositoryPath);

  assert.deepStrictEqual(outcome, { kind: "committed", count: 1 });
  assert.match(
    await fixture.output(["log", "-1", "--format=%s"]),
    /feat: stage one change/,
  );
  assert.match(await fixture.output(["status", "--short"]), /\?\? notes.md/);
});

test("stages and commits each approved split group separately", async () => {
  const fixture = await createFixture();
  await fixture.write("feature.ts", "export const feature = true;\n");
  await fixture.write("docs.md", "# Documentation\n");
  const model = new FakeLanguageModel("unused", [
    { subject: "feat: add feature", paths: ["feature.ts"] },
    { subject: "docs: add documentation", paths: ["docs.md"] },
  ]);

  const outcome = await new CommitWorkflow(
    model,
    new FakeUserInterface(true, [
      "feat: add feature",
      "docs: add documentation",
    ]),
  ).run(fixture.repositoryPath);

  assert.deepStrictEqual(outcome, { kind: "committed", count: 2 });
  assert.match(
    await fixture.output(["log", "-2", "--format=%s"]),
    /docs: add documentation\nfeat: add feature/,
  );
  assert.strictEqual(await fixture.output(["status", "--short"]), "");
});
