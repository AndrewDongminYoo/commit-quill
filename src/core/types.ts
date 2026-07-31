export type RepositorySnapshot =
  | { readonly kind: "clean" }
  | {
      readonly kind: "staged";
      readonly diff: string;
      readonly files: readonly string[];
      readonly subjects: readonly string[];
      /** Human-readable descriptions of anything withheld from `diff`. */
      readonly notices: readonly string[];
    }
  | {
      readonly kind: "unstaged";
      readonly diff: string;
      readonly files: readonly string[];
      readonly subjects: readonly string[];
      /** Human-readable descriptions of anything withheld from `diff`. */
      readonly notices: readonly string[];
    };

export type SnapshotLimits = {
  /** Upper bound on the diff text sent to a provider. */
  readonly maxDiffCharacters: number;
  /** Untracked files larger than this are listed but not read. */
  readonly maxUntrackedFileBytes: number;
};

export type CommitConvention =
  | { readonly kind: "conventional" }
  | { readonly kind: "existing"; readonly examples: readonly string[] };
