import { execFile as execFileCallback } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import type { RenamedPath, RepositorySnapshot, SnapshotLimits } from "./types";

const execFile = promisify(execFileCallback);

export const defaultSnapshotLimits: SnapshotLimits = {
  maxDiffCharacters: 64_000,
  maxUntrackedFileBytes: 128 * 1024,
  collapsedPaths: [
    "**/*.lock",
    "**/package-lock.json",
    "**/pnpm-lock.yaml",
    "**/npm-shrinkwrap.json",
    "**/go.sum",
    "**/*.pbxproj",
    "**/*.g.dart",
    "**/*.freezed.dart",
  ],
};

// `**` needs the `glob` magic word. Without it `:(exclude)**/package-lock.json`
// matches nothing and silently returns the diff unchanged — the failure looks
// exactly like success.
const excludePathspec = (patterns: readonly string[]): readonly string[] =>
  patterns.map((pattern) => `:(exclude,glob)${pattern}`);

const includePathspec = (patterns: readonly string[]): readonly string[] =>
  patterns.map((pattern) => `:(glob)${pattern}`);

type GitStatusEntry = {
  readonly indexStatus: string;
  readonly worktreeStatus: string;
  readonly path: string;
  /** Where a renamed or copied file came from. */
  readonly originalPath?: string;
};

export class GitInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitInputError";
  }
}

export async function getRepositoryRoot(cwd: string): Promise<string> {
  return (await runGit(cwd, ["rev-parse", "--show-toplevel"])).trim();
}

// The clean-tree guard runs before any key is read, so it must not pay for
// building a diff — status alone answers the question.
export async function hasChanges(cwd: string): Promise<boolean> {
  const repositoryPath = await getRepositoryRoot(cwd);
  return parseStatus(await statusOutput(repositoryPath)).length > 0;
}

export async function inspectRepository(
  cwd: string,
  limits: SnapshotLimits = defaultSnapshotLimits,
): Promise<RepositorySnapshot> {
  const repositoryPath = await getRepositoryRoot(cwd);
  const entries = parseStatus(await statusOutput(repositoryPath));
  const stagedEntries = entries.filter(
    (entry) => entry.indexStatus !== " " && entry.indexStatus !== "?",
  );
  if (stagedEntries.length > 0) {
    const staged = await diffWithCollapsed(
      repositoryPath,
      ["diff", "--cached"],
      limits.collapsedPaths,
    );
    const capped = capDiff(staged.diff, limits.maxDiffCharacters);
    return {
      kind: "staged",
      diff: capped.diff,
      files: stagedEntries.map((entry) => entry.path),
      renames: renamesOf(stagedEntries),
      subjects: await recentSubjects(repositoryPath),
      notices: [...staged.notices, ...capped.notices],
    };
  }

  if (entries.length === 0) {
    return { kind: "clean" };
  }

  const unstaged = await unstagedDiff(repositoryPath, entries, limits);
  const capped = capDiff(unstaged.diff, limits.maxDiffCharacters);
  return {
    kind: "unstaged",
    diff: capped.diff,
    files: entries.map((entry) => entry.path),
    renames: renamesOf(entries),
    subjects: await recentSubjects(repositoryPath),
    notices: [...unstaged.notices, ...capped.notices],
  };
}

export async function stagePaths(
  cwd: string,
  paths: readonly string[],
): Promise<void> {
  if (paths.length === 0) {
    throw new GitInputError("Cannot stage an empty path group.");
  }

  await runGit(cwd, ["add", "--", ...paths]);
}

export async function commit(cwd: string, subject: string): Promise<void> {
  const trimmedSubject = subject.trim();
  if (trimmedSubject.length === 0) {
    throw new GitInputError("A commit subject is required.");
  }

  await runGit(cwd, ["commit", "-m", trimmedSubject]);
}

async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  const result = await execFile("git", args, { cwd, encoding: "utf8" });
  return result.stdout;
}

// `-uall` lists the files inside an untracked directory. Without it Git reports
// the directory itself ("?? dir/"), which is not a readable file.
async function statusOutput(repositoryPath: string): Promise<string> {
  return runGit(repositoryPath, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);
}

function parseStatus(output: string): readonly GitStatusEntry[] {
  const parts = output.split("\0");
  const entries: GitStatusEntry[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part === undefined || part.length === 0) {
      continue;
    }

    const indexStatus = part[0];
    const worktreeStatus = part[1];
    if (indexStatus === undefined || worktreeStatus === undefined) {
      continue;
    }

    // With `-z` a rename is two fields, destination first: "R  new\0old\0".
    if (isRenameOrCopy(indexStatus, worktreeStatus)) {
      index += 1;
      entries.push({
        indexStatus,
        worktreeStatus,
        path: part.slice(3),
        originalPath: parts[index],
      });
      continue;
    }

    entries.push({ indexStatus, worktreeStatus, path: part.slice(3) });
  }

  return entries;
}

function renamesOf(entries: readonly GitStatusEntry[]): readonly RenamedPath[] {
  return entries.flatMap((entry) =>
    entry.originalPath === undefined
      ? []
      : [{ from: entry.originalPath, to: entry.path }],
  );
}

function isRenameOrCopy(indexStatus: string, worktreeStatus: string): boolean {
  return (
    indexStatus === "R" ||
    indexStatus === "C" ||
    worktreeStatus === "R" ||
    worktreeStatus === "C"
  );
}

async function recentSubjects(cwd: string): Promise<readonly string[]> {
  try {
    const output = await runGit(cwd, ["log", "-20", "--format=%s"]);
    return output.split("\n").filter((subject) => subject.length > 0);
  } catch (error: unknown) {
    if (hasExitCode(error, 128)) {
      return [];
    }
    throw error;
  }
}

function hasExitCode(error: unknown, expectedCode: number): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  return error.code === expectedCode;
}

type DiffPart = {
  readonly diff: string;
  readonly notices: readonly string[];
};

async function unstagedDiff(
  cwd: string,
  entries: readonly GitStatusEntry[],
  limits: SnapshotLimits,
): Promise<DiffPart> {
  const tracked = await diffWithCollapsed(cwd, ["diff"], limits.collapsedPaths);
  // An untracked lockfile has no diff to exclude, so ask Git which of them the
  // same patterns match rather than reimplementing its globbing here.
  const collapsedUntracked = new Set(
    splitLines(
      await runGit(cwd, [
        "ls-files",
        "--others",
        "--exclude-standard",
        "--",
        ...includePathspec(limits.collapsedPaths),
      ]),
    ),
  );
  const untracked = await Promise.all(
    entries
      .filter((entry) => entry.indexStatus === "?")
      .map((entry) =>
        collapsedUntracked.has(entry.path)
          ? generatedFileNote(entry.path)
          : readUntrackedFile(cwd, entry.path, limits.maxUntrackedFileBytes),
      ),
  );
  const skipped = untracked
    .filter((part) => part.notices.length > 0)
    .flatMap((part) => part.notices);
  return {
    diff: [tracked.diff, ...untracked.map((part) => part.diff)]
      .filter((part) => part.length > 0)
      .join("\n"),
    notices: [
      ...tracked.notices,
      ...(skipped.length > 0
        ? [
            `Content omitted for ${skipped.length} file(s): ${skipped.join(", ")}.`,
          ]
        : []),
    ],
  };
}

function splitLines(output: string): readonly string[] {
  return output.split("\n").filter((line) => line.length > 0);
}

/**
 * Run a diff with the collapsed paths held out, then describe them by their
 * line counts alone. The model still learns that the lockfile moved and by how
 * much, which is all a commit message needs from it.
 */
async function diffWithCollapsed(
  cwd: string,
  command: readonly string[],
  collapsedPaths: readonly string[],
): Promise<DiffPart> {
  const base = [...command, "--no-ext-diff", "--unified=3"];
  if (collapsedPaths.length === 0) {
    return { diff: await runGit(cwd, base), notices: [] };
  }

  const diff = await runGit(cwd, [
    ...base,
    "--",
    ".",
    ...excludePathspec(collapsedPaths),
  ]);
  const collapsed = splitLines(
    await runGit(cwd, [
      ...command,
      "--numstat",
      "--",
      ...includePathspec(collapsedPaths),
    ]),
  ).map(describeNumstat);
  if (collapsed.length === 0) {
    return { diff, notices: [] };
  }

  return {
    diff: `${diff}\nGenerated files changed, content omitted:\n${collapsed.join("\n")}`,
    notices: [
      `Summarised ${collapsed.length} generated file(s) instead of sending their contents.`,
    ],
  };
}

function describeNumstat(line: string): string {
  const [added, removed, path] = line.split("\t");
  return `${path ?? line} (+${added ?? "?"} -${removed ?? "?"})`;
}

function generatedFileNote(path: string): DiffPart {
  return {
    diff: `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@\n+(new generated file — content omitted)`,
    notices: [],
  };
}

// Untracked files have no blob to diff against, so their content is inlined as
// a synthetic diff. Anything binary or oversized is announced instead of read:
// unreadable bytes cost the user tokens and teach the model nothing.
async function readUntrackedFile(
  cwd: string,
  path: string,
  maxBytes: number,
): Promise<DiffPart> {
  const header = `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@\n`;
  const stats = await stat(join(cwd, path));
  if (!stats.isFile()) {
    return { diff: "", notices: [] };
  }
  if (stats.size > maxBytes) {
    return {
      diff: `${header}+(new file, ${stats.size} bytes — content omitted)`,
      notices: [path],
    };
  }

  const content = await readFile(join(cwd, path));
  if (content.includes(0)) {
    return {
      diff: `${header}+(new binary file, ${stats.size} bytes — content omitted)`,
      notices: [path],
    };
  }

  return {
    diff: `${header}+${content.toString("utf8").replace(/\n/g, "\n+")}`,
    notices: [],
  };
}

function capDiff(diff: string, maxCharacters: number): DiffPart {
  if (diff.length <= maxCharacters) {
    return { diff, notices: [] };
  }

  return {
    diff: `${diff.slice(0, maxCharacters)}\n… diff truncated at ${maxCharacters} characters.`,
    notices: [
      `The diff was truncated to ${maxCharacters} characters, so later changes were not sent.`,
    ],
  };
}
