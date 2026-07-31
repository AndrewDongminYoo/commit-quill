import type { CommitConvention } from "./types";

const MAX_EXAMPLES = 5;

export function detectConvention(
  subjects: readonly string[],
): CommitConvention {
  const examples = subjects
    .filter((subject) => subject.trim().length > 0)
    .slice(0, MAX_EXAMPLES);
  if (examples.length < 2 || !hasStablePrefix(examples)) {
    return { kind: "conventional" };
  }

  return { kind: "existing", examples };
}

function hasStablePrefix(subjects: readonly string[]): boolean {
  const prefixes = subjects.map((subject) => subjectPrefix(subject));
  const firstPrefix = prefixes[0];
  if (firstPrefix === undefined || firstPrefix.length === 0) {
    return false;
  }

  return prefixes.every((prefix) => prefix === firstPrefix);
}

function subjectPrefix(subject: string): string {
  const colon = subject.indexOf(":");
  if (colon >= 0) {
    return subject.slice(0, colon + 1);
  }

  const closingBracket = subject.indexOf("]");
  if (subject.startsWith("[") && closingBracket >= 0) {
    return subject.slice(0, closingBracket + 1);
  }

  return "";
}
