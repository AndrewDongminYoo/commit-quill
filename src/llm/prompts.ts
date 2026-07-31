import type { CommitContext } from "./provider";

export function messagePrompt(context: CommitContext): string {
  return `${conventionInstruction(context)}\nReturn the commit subject on the first line.\nAdd a blank line and a short body only when the change is not self-explanatory from its subject; omit it otherwise.\nNo markdown, no preamble, no explanation of your reasoning.\nChanged files:\n${context.files.join("\n")}${renameNote(context)}\nDiff:\n${context.diff}`;
}

// "Minimal commit groups" read as "make each group small", so the model
// produced one commit per file — a split with no reasoning behind it. The bias
// has to run the other way: one commit is the default, and each additional one
// needs a reason a reviewer would recognise.
export function groupsPrompt(context: CommitContext): string {
  return `${conventionInstruction(context)}\nGroup the changes into as few commits as possible.\nOne commit is usually the right answer — prefer it whenever every change serves a single purpose.\nStart another group only when a reviewer would want to review or revert that change separately: an unrelated fix, a second feature, a refactor that stands on its own.\nFiles that changed for the same reason belong in one group even when they differ in directory, extension, or language — a test with the code it covers, a config with the feature that needs it, every file touched by one rename.\nNever split because the files are merely different files, and never split to make the groups look tidy.\nGive each group a one-line subject.\nReturn JSON only in this shape: {"groups":[{"subject":"...","paths":["..."]}]}.\nUse every changed path exactly once.\nChanged files:\n${context.files.join("\n")}${renameNote(context)}\nDiff:\n${context.diff}`;
}

// Git reports a rename by its destination only, so a moved file otherwise looks
// like a new one — and a pure rename has no hunks to correct the impression.
function renameNote(context: CommitContext): string {
  const renames = context.renames ?? [];
  return renames.length === 0
    ? ""
    : `\nRenamed or moved (these are not new files):\n${renames
        .map((rename) => `${rename.from} -> ${rename.to}`)
        .join("\n")}`;
}

function conventionInstruction(context: CommitContext): string {
  const detected =
    context.convention.kind === "existing"
      ? `Follow these existing commit-subject examples:\n${context.convention.examples.join("\n")}`
      : "Use Conventional Commit format.";

  // Last, so the user's own rules win over the inferred convention.
  const custom = context.customInstructions?.trim();
  return custom === undefined || custom.length === 0
    ? detected
    : `${detected}\nFollow these instructions above all else:\n${custom}`;
}
