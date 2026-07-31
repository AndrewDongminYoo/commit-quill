import { z } from "zod";

import {
  LanguageModelError,
  requireSubject,
  type CommitGroup,
} from "./provider";

const proposalSchema = z.object({
  groups: z
    .array(
      z.object({
        subject: z.string(),
        paths: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1),
});

export function parseGroups(
  text: string,
  allowedPaths: readonly string[],
): readonly CommitGroup[] {
  const parsedJson = parseJson(text);
  const proposal = proposalSchema.safeParse(parsedJson);
  if (!proposal.success) {
    throw new LanguageModelError(
      "The provider did not return a valid split-commit proposal.",
    );
  }

  const allowed = new Set(allowedPaths);
  const assigned = new Set<string>();
  const groups = proposal.data.groups.map((group) => ({
    subject: requireSubject(group.subject),
    paths: group.paths.map((path) => validatePath(path, allowed, assigned)),
  }));
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
