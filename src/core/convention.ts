import type { CommitConvention } from "./types";

const MAX_EXAMPLES = 5;

export function detectConvention(
  subjects: readonly string[],
): CommitConvention {
  const examples = subjects
    .filter((subject) => subject.trim().length > 0)
    .slice(0, MAX_EXAMPLES);
  if (examples.length < 2 || !followsOneShape(examples)) {
    return { kind: "conventional" };
  }

  return { kind: "existing", examples };
}

/**
 * `type: summary` or `type(scope)!: summary`. Whatever follows the colon —
 * gitmoji, ticket keys, capitalisation — is left to the examples to convey.
 */
const CONVENTIONAL = /^[a-z]+(\([^)]*\))?!?: \S/;

/** `[scope] summary`, the other prefix style seen in the wild. */
const BRACKETED = /^\[[^\]]+\]\s*\S/;

/**
 * A convention is a shared *shape*, not a shared string.
 *
 * Comparing literal prefixes looked reasonable and was almost always false: a
 * healthy conventional history varies its type and scope on every commit, so
 * `docs(rules):` and `feat(skills):` never matched and the detector fell back
 * to generic guidance for exactly the repositories that had the strongest
 * convention to follow.
 */
function followsOneShape(subjects: readonly string[]): boolean {
  const majority = Math.floor(subjects.length / 2) + 1;
  return [CONVENTIONAL, BRACKETED].some(
    (shape) =>
      subjects.filter((subject) => shape.test(subject)).length >= majority,
  );
}
