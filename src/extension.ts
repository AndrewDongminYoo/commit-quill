import * as vscode from "vscode";

import { inspectRepository } from "./core/git";
import {
  createLanguageModel,
  providerNames,
  type ProviderName,
  type ProviderSettings,
} from "./llm/provider";
import { VsCodeCommitUserInterface } from "./vscode-user-interface";
import { CommitWorkflow } from "./workflow/commit-workflow";

const secretKeyPrefix = "auto-commit-msg.api-key";

export type ExtensionRuntimeContext = {
  readonly secrets: vscode.SecretStorage;
  readonly subscriptions: vscode.Disposable[];
};

class ExtensionInvariantError extends Error {
  constructor(value: never) {
    super(`Unsupported provider: ${String(value)}.`);
    this.name = "ExtensionInvariantError";
  }
}

export function activate(context: ExtensionRuntimeContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("auto-commit-msg.generateCommit", () =>
      generateCommit(context),
    ),
    vscode.commands.registerCommand(
      "auto-commit-msg.configureProvider",
      configureProvider,
    ),
    vscode.commands.registerCommand("auto-commit-msg.setApiKey", () =>
      setApiKey(context),
    ),
    vscode.commands.registerCommand("auto-commit-msg.removeApiKey", () =>
      removeApiKey(context),
    ),
  );
}

export function deactivate(): void {}

async function generateCommit(context: ExtensionRuntimeContext): Promise<void> {
  try {
    const workspacePath = activeWorkspacePath();
    if (workspacePath === undefined) {
      await vscode.window.showErrorMessage(
        "Open a workspace folder before generating a commit.",
      );
      return;
    }

    if ((await inspectRepository(workspacePath)).kind === "clean") {
      await vscode.window.showInformationMessage("Nothing to commit.");
      return;
    }

    const settings = await readProviderSettings(context);
    if (settings === undefined) {
      return;
    }

    await new CommitWorkflow(
      createLanguageModel(settings),
      new VsCodeCommitUserInterface(),
    ).run(workspacePath);
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "An unexpected error occurred while creating the commit.";
    await vscode.window.showErrorMessage(message);
  }
}

async function configureProvider(): Promise<void> {
  const provider = await selectProvider();
  if (provider === undefined) {
    return;
  }

  const configuration = vscode.workspace.getConfiguration("autoCommitMsg");
  const model = await vscode.window.showInputBox({
    prompt: `Enter the ${provider} model name.`,
    value: configuration.get<string>(modelSettingKey(provider)),
    validateInput: (value) =>
      value.trim().length > 0 ? undefined : "A model name is required.",
  });
  if (model === undefined) {
    return;
  }

  await configuration.update(
    "provider",
    provider,
    vscode.ConfigurationTarget.Global,
  );
  await configuration.update(
    modelSettingKey(provider),
    model.trim(),
    vscode.ConfigurationTarget.Global,
  );
  await vscode.window.showInformationMessage(
    `${provider} is configured as the active provider.`,
  );
}

async function setApiKey(context: ExtensionRuntimeContext): Promise<void> {
  const provider = await selectProvider();
  if (provider === undefined) {
    return;
  }

  const apiKey = await vscode.window.showInputBox({
    prompt: `Enter the ${provider} API key.`,
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim().length > 0 ? undefined : "An API key is required.",
  });
  if (apiKey === undefined) {
    return;
  }

  await context.secrets.store(secretKey(provider), apiKey.trim());
  await vscode.window.showInformationMessage(
    `Stored the ${provider} API key in VS Code Secret Storage.`,
  );
}

async function removeApiKey(context: ExtensionRuntimeContext): Promise<void> {
  const provider = await selectProvider();
  if (provider === undefined) {
    return;
  }

  await context.secrets.delete(secretKey(provider));
  await vscode.window.showInformationMessage(
    `Removed the ${provider} API key from VS Code Secret Storage.`,
  );
}

async function readProviderSettings(
  context: ExtensionRuntimeContext,
): Promise<ProviderSettings | undefined> {
  const configuration = vscode.workspace.getConfiguration("autoCommitMsg");
  const provider = parseProvider(configuration.get<unknown>("provider"));
  if (provider === undefined) {
    await vscode.window.showErrorMessage(
      "Select OpenAI, Anthropic, or Gemini in Auto Commit Message settings.",
    );
    return undefined;
  }

  const model = configuration.get<string>(modelSettingKey(provider), "").trim();
  if (model.length === 0) {
    await vscode.window.showErrorMessage(
      `Configure an ${provider} model before generating a commit.`,
    );
    return undefined;
  }

  const apiKey = await context.secrets.get(secretKey(provider));
  if (apiKey === undefined || apiKey.trim().length === 0) {
    await vscode.window.showErrorMessage(
      `Store an ${provider} API key before generating a commit.`,
    );
    return undefined;
  }

  return { provider, model, apiKey };
}

function activeWorkspacePath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function selectProvider(): Promise<ProviderName | undefined> {
  return parseProvider(
    await vscode.window.showQuickPick([...providerNames], {
      placeHolder: "Select an AI provider",
    }),
  );
}

function parseProvider(value: unknown): ProviderName | undefined {
  switch (value) {
    case "openai":
    case "anthropic":
    case "gemini":
      return value;
    default:
      return undefined;
  }
}

function modelSettingKey(provider: ProviderName): string {
  switch (provider) {
    case "openai":
      return "openaiModel";
    case "anthropic":
      return "anthropicModel";
    case "gemini":
      return "geminiModel";
    default:
      return assertNever(provider);
  }
}

function secretKey(provider: ProviderName): string {
  return `${secretKeyPrefix}.${provider}`;
}

function assertNever(value: never): never {
  throw new ExtensionInvariantError(value);
}
