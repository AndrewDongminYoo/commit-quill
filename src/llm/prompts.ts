import type { CommitContext } from "./provider";

export function messagePrompt(context: CommitContext): string {
  return `${conventionInstruction(context)}\nReturn the commit subject on the first line.\nAdd a blank line and a short body only when the change is not self-explanatory from its subject; omit it otherwise.\nNo markdown, no preamble, no explanation of your reasoning.\nChanged files:\n${context.files.join("\n")}${renameNote(context)}\nDiff:\n${context.diff}`;
}

export function groupsPrompt(context: CommitContext): string {
  return `${conventionInstruction(context)}\nSplit independent changes into minimal commit groups.\nReturn JSON only in this shape: {"groups":[{"subject":"...","paths":["..."]}]}.\nUse every changed path exactly once.\nChanged files:\n${context.files.join("\n")}${renameNote(context)}\nDiff:\n${context.diff}`;
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
