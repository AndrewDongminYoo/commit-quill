import * as vscode from "vscode";

/**
 * Minimal declarations for the built-in Git extension's public API.
 *
 * `vscode.git` exposes a versioned surface — `getAPI(1)` throws for any other
 * version — but `@types/vscode` does not type it. Only the members this
 * extension actually uses are declared here, so there is no vendored file to
 * keep in sync. Every Git read and mutation still goes through `core/git.ts`;
 * this API is used solely to learn *which* repository the user means and to
 * hand a message back to its Source Control input box.
 */
export interface GitRepository {
  readonly rootUri: vscode.Uri;
  readonly inputBox: { value: string };
}

interface GitApi {
  readonly repositories: readonly GitRepository[];
  getRepository(uri: vscode.Uri): GitRepository | null;
}

interface GitExtension {
  readonly enabled: boolean;
  getAPI(version: 1): GitApi;
}

type RepositoryQuickPickItem = vscode.QuickPickItem & {
  readonly repository: GitRepository;
};

async function getGitApi(): Promise<GitApi | undefined> {
  const extension = vscode.extensions.getExtension<GitExtension>("vscode.git");
  if (extension === undefined) {
    return undefined;
  }

  const exports = extension.isActive
    ? extension.exports
    : await extension.activate();
  return exports.enabled ? exports.getAPI(1) : undefined;
}

/**
 * Resolve the repository the user meant, in descending order of confidence:
 * the Source Control item they clicked, the only repository open, or the one
 * they pick. Returns `undefined` when the Git extension is unavailable or the
 * user dismisses the picker.
 */
export async function resolveRepository(
  commandArgument: unknown,
): Promise<GitRepository | undefined> {
  const api = await getGitApi();
  if (api === undefined) {
    return undefined;
  }

  const clicked = rootUriOf(commandArgument);
  if (clicked !== undefined) {
    return api.getRepository(clicked) ?? undefined;
  }

  const [only] = api.repositories;
  if (api.repositories.length === 1 && only !== undefined) {
    return only;
  }
  if (api.repositories.length === 0) {
    return undefined;
  }

  return pickRepository(api.repositories);
}

async function pickRepository(
  repositories: readonly GitRepository[],
): Promise<GitRepository | undefined> {
  const items: readonly RepositoryQuickPickItem[] = repositories.map(
    (repository) => ({
      label: workspaceRelativeLabel(repository.rootUri),
      description: repository.rootUri.fsPath,
      repository,
    }),
  );
  const selected = await vscode.window.showQuickPick<RepositoryQuickPickItem>(
    items,
    { placeHolder: "Select the repository to commit" },
  );
  return selected?.repository;
}

function workspaceRelativeLabel(uri: vscode.Uri): string {
  return (
    vscode.workspace.getWorkspaceFolder(uri)?.name ??
    uri.path.split("/").pop() ??
    uri.fsPath
  );
}

/**
 * The `scm/title` menu invokes the command with the `SourceControl` the user
 * clicked. Nothing guarantees the shape, so narrow it defensively rather than
 * casting — a palette invocation passes no argument at all.
 */
function rootUriOf(commandArgument: unknown): vscode.Uri | undefined {
  if (typeof commandArgument !== "object" || commandArgument === null) {
    return undefined;
  }

  const candidate: unknown = (commandArgument as { rootUri?: unknown }).rootUri;
  return candidate instanceof vscode.Uri ? candidate : undefined;
}
