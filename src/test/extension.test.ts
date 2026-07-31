import * as assert from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import * as vscode from "vscode";

import { activate, type ExtensionRuntimeContext } from "../extension";
import {
  modelOptionsForProvider,
  nextProviderSetupStep,
} from "../provider-setup";

class TestSecretStorage implements vscode.SecretStorage {
  readonly onDidChange: vscode.Event<vscode.SecretStorageChangeEvent> = () => ({
    dispose: () => undefined,
  });

  async get(): Promise<string | undefined> {
    return undefined;
  }

  async store(): Promise<void> {}

  async delete(): Promise<void> {}

  async keys(): Promise<string[]> {
    return [];
  }
}

suite("Extension commands", () => {
  test("contributes the commit and provider-management commands", async () => {
    const context: ExtensionRuntimeContext = {
      secrets: new TestSecretStorage(),
      subscriptions: [],
    };
    activate(context);
    const commands = await vscode.commands.getCommands(true);

    assert.ok(commands.includes("auto-commit-msg.generateCommit"));
    assert.ok(commands.includes("auto-commit-msg.configureProvider"));
    assert.ok(commands.includes("auto-commit-msg.setApiKey"));
    assert.ok(commands.includes("auto-commit-msg.removeApiKey"));
    context.subscriptions.forEach((subscription) => subscription.dispose());
  });

  test("uses an icon for the Source Control generate action", async () => {
    const manifest = await readFile(
      join(__dirname, "../../package.json"),
      "utf8",
    );
    assert.match(manifest, /"icon": "\$\(sparkle\)"/);
  });
});

suite("Provider setup", () => {
  test("requests the missing provider, model, and API key in order", () => {
    assert.deepStrictEqual(nextProviderSetupStep({}), { kind: "provider" });
    assert.deepStrictEqual(nextProviderSetupStep({ provider: "openai" }), {
      kind: "model",
      provider: "openai",
    });
    assert.deepStrictEqual(
      nextProviderSetupStep({
        provider: "openai",
        model: "gpt-5-mini",
      }),
      { kind: "api-key", provider: "openai" },
    );
  });

  test("returns usable settings only after every provider value is available", () => {
    const apiKey = "test-key";
    assert.deepStrictEqual(
      nextProviderSetupStep({
        provider: "gemini",
        model: "gemini-3.6-flash",
        apiKey,
      }),
      {
        kind: "ready",
        settings: {
          provider: "gemini",
          model: "gemini-3.6-flash",
          apiKey,
        },
      },
    );
  });

  test("lists provider-specific model choices", () => {
    for (const provider of ["openai", "anthropic", "gemini"] as const) {
      assert.ok(modelOptionsForProvider(provider).length > 0);
    }
  });
});
