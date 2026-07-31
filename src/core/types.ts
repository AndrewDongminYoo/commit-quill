/**
 * A rename Git detected. Kept out of `files` deliberately: that list doubles as
 * the allowlist for paths a split proposal may name, and only the destination
 * is a path that can actually be staged.
 */
export type RenamedPath = {
  readonly from: string;
  readonly to: string;
};

export type RepositorySnapshot =
  | { readonly kind: "clean" }
  | {
      readonly kind: "staged";
      readonly diff: string;
      readonly files: readonly string[];
      readonly renames: readonly RenamedPath[];
      readonly subjects: readonly string[];
      /** Human-readable descriptions of anything withheld from `diff`. */
      readonly notices: readonly string[];
    }
  | {
      readonly kind: "unstaged";
      readonly diff: string;
      readonly files: readonly string[];
      readonly renames: readonly RenamedPath[];
      readonly subjects: readonly string[];
      /** Human-readable descriptions of anything withheld from `diff`. */
      readonly notices: readonly string[];
    };

export type SnapshotLimits = {
  /** Upper bound on the diff text sent to a provider. */
  readonly maxDiffCharacters: number;
  /** Untracked files larger than this are listed but not read. */
  readonly maxUntrackedFileBytes: number;
  /**
   * Git pathspec globs whose content is summarised instead of sent.
   *
   * Lockfiles and generated project files are the largest thing in a typical
   * diff and the least informative: a `package-lock.json` regeneration was
   * measured at 86% of one commit's diff and more than twice the whole
   * character budget on its own, which pushed every source file past the cut.
   * The model still needs to know they changed, so their line counts survive.
   */
  readonly collapsedPaths: readonly string[];
};

export type CommitConvention =
  | { readonly kind: "conventional" }
  | { readonly kind: "existing"; readonly examples: readonly string[] };
