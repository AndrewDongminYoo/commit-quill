import * as vscode from "vscode";

import type { CommitGroup } from "./llm/provider";
import type { CommitUserInterface } from "./workflow/commit-workflow";

const CONFIRM_SPLIT = "Create commits";

export class VsCodeCommitUserInterface implements CommitUserInterface {
  async showInformation(message: string): Promise<void> {
    await vscode.window.showInformationMessage(message);
  }

  async confirmSplit(groups: readonly CommitGroup[]): Promise<boolean> {
    const detail = groups
      .map((group) => `${group.subject} (${group.paths.join(", ")})`)
      .join("\n");
    const selected = await vscode.window.showWarningMessage(
      `Create ${groups.length} separate commits?`,
      { modal: true, detail },
      CONFIRM_SPLIT,
    );
    return selected === CONFIRM_SPLIT;
  }

  async editSubject(subject: string): Promise<string | undefined> {
    return vscode.window.showInputBox({
      prompt: "Review the commit subject before committing.",
      value: subject,
      validateInput: (value) =>
        value.trim().length > 0 && !value.includes("\n")
          ? undefined
          : "Enter one non-empty line.",
    });
  }
}
