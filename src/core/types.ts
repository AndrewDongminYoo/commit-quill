export type RepositorySnapshot =
  | { readonly kind: "clean" }
  | {
      readonly kind: "staged";
      readonly diff: string;
      readonly files: readonly string[];
      readonly subjects: readonly string[];
    }
  | {
      readonly kind: "unstaged";
      readonly diff: string;
      readonly files: readonly string[];
      readonly subjects: readonly string[];
    };

export type CommitConvention =
  | { readonly kind: "conventional" }
  | { readonly kind: "existing"; readonly examples: readonly string[] };
