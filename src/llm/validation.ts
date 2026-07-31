import { arrayAt, stringAt } from "./json";
import {
  firstLine,
  LanguageModelError,
  requireMessage,
  type CommitGroup,
} from "./provider";

function invalidProposal(): never {
  throw new LanguageModelError(
    "The provider did not return a valid split-commit proposal.",
  );
}

export function parseGroups(
  text: string,
  allowedPaths: readonly string[],
): readonly CommitGroup[] {
  const proposed = arrayAt(parseJson(text), "groups");
  if (proposed.length === 0) {
    invalidProposal();
  }

  const allowed = new Set(allowedPaths);
  const assigned = new Set<string>();
  const groups = proposed.map((group) => {
    const subject = stringAt(group, "subject");
    const paths = arrayAt(group, "paths");
    if (subject === undefined || paths.length === 0) {
      invalidProposal();
    }

    return {
      // Each group is committed with `git commit -m`, so only a subject fits.
      subject: firstLine(requireMessage(subject)),
      paths: paths.map((path) =>
        typeof path === "string" && path.length > 0
          ? validatePath(path, allowed, assigned)
          : invalidProposal(),
      ),
    };
  });
  if (assigned.size !== allowed.size) {
    throw new LanguageModelError(
      "The split-commit proposal does not cover every changed path.",
    );
  }

  return groups;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(stripCodeFence(text));
  } catch (error: unknown) {
    throw new LanguageModelError(
      "The provider did not return valid JSON for split commits.",
      error,
    );
  }
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  const firstLineEnd = trimmed.indexOf("\n");
  if (firstLineEnd < 0 || !trimmed.endsWith("```")) {
    return trimmed;
  }

  return trimmed.slice(firstLineEnd + 1, -3).trim();
}

function validatePath(
  path: string,
  allowed: ReadonlySet<string>,
  assigned: Set<string>,
): string {
  if (!allowed.has(path)) {
    throw new LanguageModelError(
      `The proposed path '${path}' is not present in the Git snapshot.`,
    );
  }
  if (assigned.has(path)) {
    throw new LanguageModelError(
      `The proposed path '${path}' appears more than once.`,
    );
  }

  assigned.add(path);
  return path;
}
