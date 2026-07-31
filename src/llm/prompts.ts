import type { CommitContext } from "./provider";

export function messagePrompt(context: CommitContext): string {
  return `${conventionInstruction(context)}\nReturn the commit subject on the first line.\nAdd a blank line and a short body only when the change is not self-explanatory from its subject; omit it otherwise.\nNo markdown, no preamble, no explanation of your reasoning.\nChanged files:\n${context.files.join("\n")}\nDiff:\n${context.diff}`;
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
