import * as vscode from "vscode";

import { defaultSnapshotLimits, hasChanges } from "./core/git";
import type { SnapshotLimits } from "./core/types";
import {
  createLanguageModel,
  FetchHttpClient,
  LanguageModelCancelledError,
  providerNames,
  type ProviderName,
  type ProviderSettings,
} from "./llm/provider";
import {
  modelOptionsForProvider,
  nextProviderSetupStep,
  type ProviderModelOption,
} from "./provider-setup";
import { resolveRepository } from "./vscode-git";
import { ProgressReportingLanguageModel } from "./vscode-language-model";
import { VsCodeCommitUserInterface } from "./vscode-user-interface";
import {
  CommitWorkflow,
  type StagedOutput,
  type WorkflowOutcome,
} from "./workflow/commit-workflow";

const secretKeyPrefix = "commit-quill.api-key";

export type ExtensionRuntimeContext = {
  readonly secrets: vscode.SecretStorage;
  readonly subscriptions: vscode.Disposable[];
};

type ProviderQuickPickItem = vscode.QuickPickItem & {
  readonly provider: ProviderName;
};

type ModelQuickPickItem =
  | (vscode.QuickPickItem & {
      readonly selectionKind: "catalog";
      readonly model: string;
    })
  | (vscode.QuickPickItem & { readonly selectionKind: "custom" });

class ExtensionInvariantError extends Error {
  constructor(value: never) {
    super(`Unsupported provider: ${String(value)}.`);
    this.name = "ExtensionInvariantError";
  }
}

export function activate(context: ExtensionRuntimeContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "commitQuill.generate",
      // The scm/title menu passes the Source Control the user clicked.
      (scmArgument: unknown) => generateCommit(context, scmArgument),
    ),
    vscode.commands.registerCommand("commitQuill.configureProvider", () =>
      configureProvider(context),
    ),
    vscode.commands.registerCommand("commitQuill.setApiKey", () =>
      setApiKey(context),
    ),
    vscode.commands.registerCommand("commitQuill.removeApiKey", () =>
      removeApiKey(context),
    ),
  );
}

export function deactivate(): void {}

async function generateCommit(
  context: ExtensionRuntimeContext,
  scmArgument?: unknown,
): Promise<void> {
  try {
    const repository = await resolveRepository(scmArgument);
    const workspacePath = repository?.rootUri.fsPath ?? activeWorkspacePath();
    if (workspacePath === undefined) {
      await vscode.window.showErrorMessage(
        "Open a Git repository before generating a commit.",
      );
      return;
    }

    if (!(await hasChanges(workspacePath))) {
      await vscode.window.showInformationMessage("Nothing to commit.");
      return;
    }

    const settings = await readProviderSettings(context);
    if (settings === undefined) {
      return;
    }

    // Drafting needs a repository handle for its input box, so a workspace-
    // folder fallback (no Git extension) always commits directly.
    const stagedOutput: StagedOutput =
      repository !== undefined && !readCommitDirectly() ? "draft" : "commit";

    const controller = new AbortController();
    const client = new FetchHttpClient(controller.signal);
    const build = (model: string): ProgressReportingLanguageModel =>
      new ProgressReportingLanguageModel(
        createLanguageModel({ ...settings, model }, client),
        controller,
      );

    const configuration = vscode.workspace.getConfiguration("commitQuill");
    const splitModel = configuration.get<string>("splitModel", "").trim();

    const outcome = await new CommitWorkflow(
      build(settings.model),
      new VsCodeCommitUserInterface(repository),
      {
        limits: readSnapshotLimits(),
        stagedOutput,
        customInstructions: configuration.get<string>("customInstructions", ""),
        splitUnstaged: configuration.get<boolean>("splitUnstagedChanges", true),
        // Same provider, so the stored key and the HTTP client both carry over.
        splitModel: splitModel.length > 0 ? build(splitModel) : undefined,
      },
    ).run(workspacePath);
    await reportOutcome(outcome);
  } catch (error: unknown) {
    // Cancelling is a choice the user already made; do not report it back.
    if (error instanceof LanguageModelCancelledError) {
      return;
    }

    const message =
      error instanceof Error
        ? error.message
        : "An unexpected error occurred while creating the commit.";
    await vscode.window.showErrorMessage(message);
  }
}

async function configureProvider(
  context: ExtensionRuntimeContext,
): Promise<ProviderSettings | undefined> {
  const provider = await selectProvider();
  if (provider === undefined) {
    return undefined;
  }

  const configuration = vscode.workspace.getConfiguration("commitQuill");
  await configuration.update(
    "provider",
    provider,
    vscode.ConfigurationTarget.Global,
  );

  const model = await storeModelSelection(provider);
  if (model === undefined) {
    return undefined;
  }

  const apiKey = await context.secrets.get(secretKey(provider));
  if (apiKey !== undefined && apiKey.trim().length > 0) {
    await vscode.window.showInformationMessage(
      `${provider} is configured as the active provider.`,
    );
    return { provider, model, apiKey: apiKey.trim() };
  }

  const storedApiKey = await promptForApiKey(context, provider);
  if (storedApiKey === undefined) {
    return undefined;
  }

  await vscode.window.showInformationMessage(
    `${provider} is configured as the active provider.`,
  );
  return { provider, model, apiKey: storedApiKey };
}

async function setApiKey(context: ExtensionRuntimeContext): Promise<void> {
  const provider = await selectProvider();
  if (provider === undefined) {
    return;
  }

  const apiKey = await promptForApiKey(context, provider);
  if (apiKey === undefined) {
    return;
  }

  await vscode.window.showInformationMessage(
    `Stored the ${provider} API key in VS Code Secret Storage.`,
  );
}

async function promptForApiKey(
  context: ExtensionRuntimeContext,
  provider: ProviderName,
): Promise<string | undefined> {
  const apiKey = await vscode.window.showInputBox({
    prompt: `Enter the ${provider} API key.`,
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim().length > 0 ? undefined : "An API key is required.",
  });
  if (apiKey === undefined) {
    return undefined;
  }

  const trimmedApiKey = apiKey.trim();
  await context.secrets.store(secretKey(provider), trimmedApiKey);
  return trimmedApiKey;
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
  const configuration = vscode.workspace.getConfiguration("commitQuill");
  const provider = parseProvider(configuration.get<unknown>("provider"));
  const step = nextProviderSetupStep({
    provider,
    model:
      provider === undefined
        ? undefined
        : configuration.get<string>(modelSettingKey(provider), ""),
    apiKey:
      provider === undefined
        ? undefined
        : await context.secrets.get(secretKey(provider)),
  });

  switch (step.kind) {
    case "provider":
      return configureProvider(context);
    case "model":
      return completeModelSelection(context, step.provider);
    case "api-key":
      return completeApiKeyConfiguration(context, step.provider);
    case "ready":
      return step.settings;
    default:
      return assertNever(step);
  }
}

/**
 * Commits are the one thing this command does that the user cannot undo with
 * Escape, so say when they happened — including the ones already made before a
 * cancellation. Drafting needs no message: the filled input box is the receipt,
 * and a clean tree was already reported by the workflow.
 */
async function reportOutcome(outcome: WorkflowOutcome): Promise<void> {
  switch (outcome.kind) {
    case "committed":
      await vscode.window.showInformationMessage(
        `Created ${String(outcome.count)} commit(s).`,
      );
      return;
    case "cancelled":
      if (outcome.count > 0) {
        await vscode.window.showInformationMessage(
          `Created ${String(outcome.count)} commit(s) before cancelling; the remaining groups were left staged or unstaged as they were.`,
        );
      }
      return;
    case "drafted":
    case "nothing-to-commit":
      return;
    default:
      return assertNever(outcome);
  }
}

function readCommitDirectly(): boolean {
  return vscode.workspace
    .getConfiguration("commitQuill")
    .get<boolean>("commitDirectly", false);
}

function readSnapshotLimits(): SnapshotLimits {
  const configuration = vscode.workspace.getConfiguration("commitQuill");
  return {
    ...defaultSnapshotLimits,
    maxDiffCharacters: configuration.get<number>(
      "maxDiffCharacters",
      defaultSnapshotLimits.maxDiffCharacters,
    ),
    collapsedPaths: configuration.get<string[]>("collapsedPaths", [
      ...defaultSnapshotLimits.collapsedPaths,
    ]),
  };
}

function activeWorkspacePath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function selectProvider(): Promise<ProviderName | undefined> {
  const providerOptions: readonly ProviderQuickPickItem[] = providerNames.map(
    (provider) => ({
      label: providerLabel(provider),
      description: `${providerLabel(provider)} API`,
      provider,
    }),
  );
  const selected = await vscode.window.showQuickPick<ProviderQuickPickItem>(
    providerOptions,
    { placeHolder: "Select an AI provider" },
  );
  return selected?.provider;
}

async function selectModel(
  provider: ProviderName,
): Promise<string | undefined> {
  const modelOptions: readonly ModelQuickPickItem[] = [
    ...modelOptionsForProvider(provider).map(toModelQuickPickItem),
    {
      label: "$(edit) Enter a custom model ID",
      description: "Use a model that is available to your account.",
      selectionKind: "custom",
    },
  ];
  const selected = await vscode.window.showQuickPick<ModelQuickPickItem>(
    modelOptions,
    { placeHolder: `Select a ${providerLabel(provider)} model` },
  );
  if (selected === undefined) {
    return undefined;
  }

  switch (selected.selectionKind) {
    case "catalog":
      return selected.model;
    case "custom":
      return promptForCustomModel(provider);
    default:
      return assertNever(selected);
  }
}

async function storeModelSelection(
  provider: ProviderName,
): Promise<string | undefined> {
  const model = await selectModel(provider);
  if (model === undefined) {
    return undefined;
  }

  await vscode.workspace
    .getConfiguration("commitQuill")
    .update(
      modelSettingKey(provider),
      model,
      vscode.ConfigurationTarget.Global,
    );
  return model;
}

function toModelQuickPickItem(option: ProviderModelOption): ModelQuickPickItem {
  return {
    label: option.label,
    description: option.description,
    detail: option.model,
    selectionKind: "catalog",
    model: option.model,
  };
}

async function promptForCustomModel(
  provider: ProviderName,
): Promise<string | undefined> {
  const model = await vscode.window.showInputBox({
    prompt: `Enter the ${providerLabel(provider)} model ID.`,
    validateInput: (value) =>
      value.trim().length > 0 ? undefined : "A model ID is required.",
  });
  return model?.trim();
}

async function completeModelSelection(
  context: ExtensionRuntimeContext,
  provider: ProviderName,
): Promise<ProviderSettings | undefined> {
  const model = await storeModelSelection(provider);
  if (model === undefined) {
    return undefined;
  }
  return readProviderSettings(context);
}

async function completeApiKeyConfiguration(
  context: ExtensionRuntimeContext,
  provider: ProviderName,
): Promise<ProviderSettings | undefined> {
  if ((await promptForApiKey(context, provider)) === undefined) {
    return undefined;
  }

  return readProviderSettings(context);
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

function providerLabel(provider: ProviderName): string {
  switch (provider) {
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic";
    case "gemini":
      return "Gemini";
    default:
      return assertNever(provider);
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
