import * as assert from "node:assert";

import * as vscode from "vscode";

import { activate, type ExtensionRuntimeContext } from "../extension";

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
});
