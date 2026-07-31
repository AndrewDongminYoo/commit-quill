import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import type { RepositorySnapshot } from "./types";

const execFile = promisify(execFileCallback);

type GitStatusEntry = {
  readonly indexStatus: string;
  readonly worktreeStatus: string;
  readonly path: string;
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

export async function inspectRepository(
  cwd: string,
): Promise<RepositorySnapshot> {
  const repositoryPath = await getRepositoryRoot(cwd);
  const entries = parseStatus(
    await runGit(repositoryPath, ["status", "--porcelain=v1", "-z"]),
  );
  const stagedEntries = entries.filter(
    (entry) => entry.indexStatus !== " " && entry.indexStatus !== "?",
  );
  if (stagedEntries.length > 0) {
    return {
      kind: "staged",
      diff: await runGit(repositoryPath, [
        "diff",
        "--cached",
        "--no-ext-diff",
        "--unified=3",
      ]),
      files: stagedEntries.map((entry) => entry.path),
      subjects: await recentSubjects(repositoryPath),
    };
  }

  if (entries.length === 0) {
    return { kind: "clean" };
  }

  const paths = entries.map((entry) => entry.path);
  return {
    kind: "unstaged",
    diff: await unstagedDiff(repositoryPath, entries),
    files: paths,
    subjects: await recentSubjects(repositoryPath),
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

    entries.push({ indexStatus, worktreeStatus, path: part.slice(3) });
    if (isRenameOrCopy(indexStatus, worktreeStatus)) {
      index += 1;
    }
  }

  return entries;
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

async function unstagedDiff(
  cwd: string,
  entries: readonly GitStatusEntry[],
): Promise<string> {
  const trackedDiff = await runGit(cwd, [
    "diff",
    "--no-ext-diff",
    "--unified=3",
  ]);
  const untrackedEntries = entries.filter((entry) => entry.indexStatus === "?");
  const untrackedContent = await Promise.all(
    untrackedEntries.map((entry) => readUntrackedFile(cwd, entry.path)),
  );
  return [trackedDiff, ...untrackedContent]
    .filter((part) => part.length > 0)
    .join("\n");
}

async function readUntrackedFile(cwd: string, path: string): Promise<string> {
  const content = await readFile(join(cwd, path), "utf8");
  return `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@\n+${content.replace(/\n/g, "\n+")}`;
}
