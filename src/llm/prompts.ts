import type { CommitContext } from "./provider";

export function subjectPrompt(context: CommitContext): string {
  return `${conventionInstruction(context)}\nReturn exactly one commit subject with no markdown or explanation.\nChanged files:\n${context.files.join("\n")}\nDiff:\n${context.diff}`;
}

export function groupsPrompt(context: CommitContext): string {
  return `${conventionInstruction(context)}\nSplit independent changes into minimal commit groups.\nReturn JSON only in this shape: {"groups":[{"subject":"...","paths":["..."]}]}.\nUse every changed path exactly once.\nChanged files:\n${context.files.join("\n")}\nDiff:\n${context.diff}`;
}

function conventionInstruction(context: CommitContext): string {
  if (context.convention.kind === "existing") {
    return `Follow these existing commit-subject examples:\n${context.convention.examples.join("\n")}`;
  }

  return "Use Conventional Commit format.";
}
