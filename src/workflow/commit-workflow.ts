import {
  commit,
  defaultSnapshotLimits,
  getRepositoryRoot,
  inspectRepository,
  stagePaths,
} from "../core/git";
import { detectConvention } from "../core/convention";
import type { RepositorySnapshot, SnapshotLimits } from "../core/types";
import {
  firstLine,
  type CommitContext,
  type CommitGroup,
  type CommitLanguageModel,
} from "../llm/provider";

export type WorkflowOutcome =
  | { readonly kind: "nothing-to-commit" }
  /** `count` is how many commits were already created before cancelling. */
  | { readonly kind: "cancelled"; readonly count: number }
  | { readonly kind: "drafted" }
  | { readonly kind: "committed"; readonly count: number };

/**
 * A split run that failed partway leaves real commits behind. Carrying the
 * count means the user is told what exists rather than being handed a bare Git
 * error over a repository that quietly moved.
 */
export class PartialCommitError extends Error {
  readonly count: number;

  constructor(count: number, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(
      `Created ${String(count)} commit(s), then stopped: ${reason} The remaining groups were not committed.`,
      { cause },
    );
    this.name = "PartialCommitError";
    this.count = count;
  }
}

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
  draftMessage(message: string): Promise<void>;
}

class WorkflowInvariantError extends Error {
  constructor(value: never) {
    super(`Unhandled repository snapshot: ${JSON.stringify(value)}`);
    this.name = "WorkflowInvariantError";
  }
}

export type WorkflowOptions = {
  readonly limits?: SnapshotLimits;
  readonly stagedOutput?: StagedOutput;
  /** Extra guidance appended to every prompt, e.g. a house convention. */
  readonly customInstructions?: string;
  /** Whether an unstaged tree is proposed as several commits or described as one. */
  readonly splitUnstaged?: boolean;
  /**
   * Model for the split proposal, when it should differ from `model`.
   *
   * Grouping several files by why they changed and naming each group is a
   * markedly harder task than summarising one staged diff — a small model
   * groups adequately but mislabels the types. Running the split on a stronger
   * model without paying for it on every ordinary commit is worth one seam.
   */
  readonly splitModel?: CommitLanguageModel;
};

export class CommitWorkflow {
  readonly model: CommitLanguageModel;
  readonly userInterface: CommitUserInterface;
  readonly limits: SnapshotLimits;
  readonly stagedOutput: StagedOutput;
  readonly customInstructions: string | undefined;
  readonly splitUnstaged: boolean;
  readonly splitModel: CommitLanguageModel;

  constructor(
    model: CommitLanguageModel,
    userInterface: CommitUserInterface,
    options: WorkflowOptions = {},
  ) {
    this.model = model;
    this.userInterface = userInterface;
    this.limits = options.limits ?? defaultSnapshotLimits;
    this.stagedOutput = options.stagedOutput ?? "commit";
    this.customInstructions = options.customInstructions;
    this.splitUnstaged = options.splitUnstaged ?? true;
    this.splitModel = options.splitModel ?? model;
  }

  private context(
    snapshot: Extract<
      RepositorySnapshot,
      { readonly kind: "staged" | "unstaged" }
    >,
  ): CommitContext {
    return {
      diff: snapshot.diff,
      files: snapshot.files,
      renames: snapshot.renames,
      convention: detectConvention(snapshot.subjects),
      customInstructions: this.customInstructions,
    };
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
    const message = await this.model.generateMessage(this.context(snapshot));
    // The input box holds a whole commit message, so any body survives here.
    if (this.stagedOutput === "draft") {
      await this.userInterface.draftMessage(message);
      return { kind: "drafted" };
    }

    // `git commit -m` plus a single-line confirmation box cannot carry a body.
    const confirmedSubject = await this.userInterface.editSubject(
      firstLine(message),
    );
    if (confirmedSubject === undefined) {
      return { kind: "cancelled", count: 0 };
    }

    await commit(await getRepositoryRoot(cwd), confirmedSubject);
    return { kind: "committed", count: 1 };
  }

  private async commitUnstaged(
    cwd: string,
    snapshot: Extract<RepositorySnapshot, { readonly kind: "unstaged" }>,
  ): Promise<WorkflowOutcome> {
    // Splitting off: describe the whole working tree in one message and hand it
    // to the input box. Committing it would mean deciding what to stage, and
    // that decision is the user's — this path never had their approval for it.
    if (!this.splitUnstaged) {
      await this.userInterface.draftMessage(
        await this.model.generateMessage(this.context(snapshot)),
      );
      return { kind: "drafted" };
    }

    const groups = await this.splitModel.proposeGroups(this.context(snapshot));
    if (!(await this.userInterface.confirmSplit(groups))) {
      return { kind: "cancelled", count: 0 };
    }

    const repositoryPath = await getRepositoryRoot(cwd);
    let committedCount = 0;
    for (const group of groups) {
      const confirmedSubject = await this.userInterface.editSubject(
        group.subject,
      );
      if (confirmedSubject === undefined) {
        return { kind: "cancelled", count: committedCount };
      }

      try {
        await stagePaths(repositoryPath, group.paths);
        await commit(repositoryPath, confirmedSubject);
      } catch (error: unknown) {
        throw new PartialCommitError(committedCount, error);
      }

      committedCount += 1;
    }

    return { kind: "committed", count: committedCount };
  }
}

function assertNever(value: never): never {
  throw new WorkflowInvariantError(value);
}
