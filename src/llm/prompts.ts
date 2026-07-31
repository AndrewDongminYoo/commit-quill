import type { CommitContext } from "./provider";

/**
 * The convention instruction sits next to the line that asks for a subject, not
 * at the top of the prompt. Stated once up front and then separated by six
 * lines of grouping rules, it was reliably ignored — the model produced prose
 * subjects for a repository with an impeccable conventional history.
 */
export function messagePrompt(context: CommitContext): string {
  return [
    "Write a commit message for the change below.",
    `Put the subject on the first line. ${subjectRule(context)}`,
    "Add a blank line and a short body only when the change is not self-explanatory from its subject; omit it otherwise.",
    "No markdown, no preamble, no explanation of your reasoning.",
    fileSection(context),
    `Diff:\n${context.diff}`,
  ].join("\n");
}

// "Minimal commit groups" read as "make each group small", so the model
// produced one commit per file — a split with no reasoning behind it. The bias
// has to run the other way: one commit is the default, and each additional one
// needs a reason a reviewer would recognise.
export function groupsPrompt(context: CommitContext): string {
  return [
    "Group the changes below into as few commits as possible.",
    "One commit is usually the right answer — prefer it whenever every change serves a single purpose.",
    "Start another group only when a reviewer would want to review or revert that change separately: an unrelated fix, a second feature, a refactor that stands on its own.",
    "Files that changed for the same reason belong in one group even when they differ in directory, extension, or language — a test with the code it covers, a config with the feature that needs it, every file touched by one rename.",
    "Never split because the files are merely different files, and never split to make the groups look tidy.",
    // The workflow commits groups in the order returned, so ordering is
    // actionable rather than decorative. Whether a model actually honours it is
    // the open question this line exists to answer.
    "Return the groups in the order they should be committed: when one change caused or enabled another — a linter config and the files it rewrote, a rename and the call sites it broke — the cause comes first.",
    // The model picks a type from the majority of files in a group and
    // mislabels the rest — three trunk-formatted files became "docs" even
    // though one of them was a TypeScript test.
    "Pick a type that covers every file in the group, not just most of them: a group holding both prose and code is not a docs change, and a change that only reformats is a style change.",
    `Give each group a one-line subject. ${subjectRule(context)}`,
    'Return JSON only in this shape: {"groups":[{"subject":"...","paths":["..."]}]}.',
    "Use every changed path exactly once.",
    fileSection(context),
    `Diff:\n${context.diff}`,
  ].join("\n");
}

function subjectRule(context: CommitContext): string {
  const detected =
    context.convention.kind === "existing"
      ? `Match the style of this repository's recent subjects exactly — their type prefixes, scopes, emoji, capitalisation, and tense:\n${context.convention.examples.join("\n")}`
      : "Use Conventional Commit format: a lowercase type, an optional scope in parentheses, a colon, then the summary.";

  // Last, so the user's own rules win over anything inferred from history.
  const custom = context.customInstructions?.trim();
  return custom === undefined || custom.length === 0
    ? detected
    : `${detected}\nFollow these instructions above all else:\n${custom}`;
}

function fileSection(context: CommitContext): string {
  return `Changed files:\n${context.files.join("\n")}${renameNote(context)}`;
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
