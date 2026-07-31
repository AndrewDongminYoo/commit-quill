import {
  commit,
  defaultSnapshotLimits,
  getRepositoryRoot,
  inspectRepository,
  stagePaths,
} from "../core/git";
import { detectConvention } from "../core/convention";
import type { RepositorySnapshot, SnapshotLimits } from "../core/types";
import type { CommitGroup, CommitLanguageModel } from "../llm/provider";

export type WorkflowOutcome =
  | { readonly kind: "nothing-to-commit" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "drafted" }
  | { readonly kind: "committed"; readonly count: number };

/**
 * What to do with the subject generated for an already-staged tree.
 *
 * `draft` hands it to the user's Source Control input box and stops, which is
 * what GitLens does and the only path that can carry a multi-line message.
 * `commit` keeps the original behavior of confirming and committing directly.
 * The split path always commits — a stage-commit loop has nowhere to put each
 * intermediate message.
 */
export type StagedOutput = "draft" | "commit";

export interface CommitUserInterface {
  showInformation(message: string): Promise<void>;
  confirmSplit(groups: readonly CommitGroup[]): Promise<boolean>;
  editSubject(subject: string): Promise<string | undefined>;
  draftSubject(subject: string): Promise<void>;
}

class WorkflowInvariantError extends Error {
  constructor(value: never) {
    super(`Unhandled repository snapshot: ${JSON.stringify(value)}`);
    this.name = "WorkflowInvariantError";
  }
}

export class CommitWorkflow {
  readonly model: CommitLanguageModel;
  readonly userInterface: CommitUserInterface;
  readonly limits: SnapshotLimits;
  readonly stagedOutput: StagedOutput;

  constructor(
    model: CommitLanguageModel,
    userInterface: CommitUserInterface,
    limits: SnapshotLimits = defaultSnapshotLimits,
    stagedOutput: StagedOutput = "commit",
  ) {
    this.model = model;
    this.userInterface = userInterface;
    this.limits = limits;
    this.stagedOutput = stagedOutput;
  }

  async run(cwd: string): Promise<WorkflowOutcome> {
    const snapshot = await inspectRepository(cwd, this.limits);
    if (snapshot.kind === "clean") {
      await this.userInterface.showInformation("Nothing to commit.");
      return { kind: "nothing-to-commit" };
    }

    // Never let a cap be silent: the user is paying for these tokens and the
    // subject is only as good as what actually reached the provider.
    if (snapshot.notices.length > 0) {
      await this.userInterface.showInformation(snapshot.notices.join(" "));
    }

    switch (snapshot.kind) {
      case "staged":
        return this.commitStaged(cwd, snapshot);
      case "unstaged":
        return this.commitUnstaged(cwd, snapshot);
      default:
        return assertNever(snapshot);
    }
  }

  private async commitStaged(
    cwd: string,
    snapshot: Extract<RepositorySnapshot, { readonly kind: "staged" }>,
  ): Promise<WorkflowOutcome> {
    const subject = await this.model.generateSubject({
      diff: snapshot.diff,
      files: snapshot.files,
      convention: detectConvention(snapshot.subjects),
    });
    if (this.stagedOutput === "draft") {
      await this.userInterface.draftSubject(subject);
      return { kind: "drafted" };
    }

    const confirmedSubject = await this.userInterface.editSubject(subject);
    if (confirmedSubject === undefined) {
      return { kind: "cancelled" };
    }

    await commit(await getRepositoryRoot(cwd), confirmedSubject);
    return { kind: "committed", count: 1 };
  }

  private async commitUnstaged(
    cwd: string,
    snapshot: Extract<RepositorySnapshot, { readonly kind: "unstaged" }>,
  ): Promise<WorkflowOutcome> {
    const groups = await this.model.proposeGroups({
      diff: snapshot.diff,
      files: snapshot.files,
      convention: detectConvention(snapshot.subjects),
    });
    if (!(await this.userInterface.confirmSplit(groups))) {
      return { kind: "cancelled" };
    }

    const repositoryPath = await getRepositoryRoot(cwd);
    let committedCount = 0;
    for (const group of groups) {
      const confirmedSubject = await this.userInterface.editSubject(
        group.subject,
      );
      if (confirmedSubject === undefined) {
        return { kind: "cancelled" };
      }

      await stagePaths(repositoryPath, group.paths);
      await commit(repositoryPath, confirmedSubject);
      committedCount += 1;
    }

    return { kind: "committed", count: committedCount };
  }
}

function assertNever(value: never): never {
  throw new WorkflowInvariantError(value);
}
