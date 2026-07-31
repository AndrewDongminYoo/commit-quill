import * as vscode from "vscode";

import type { CommitGroup } from "./llm/provider";
import type { GitRepository } from "./vscode-git";
import type { CommitUserInterface } from "./workflow/commit-workflow";

const CONFIRM_SPLIT = "Create commits";

export class VsCodeCommitUserInterface implements CommitUserInterface {
  private readonly repository: GitRepository | undefined;

  constructor(repository?: GitRepository) {
    this.repository = repository;
  }

  async showInformation(message: string): Promise<void> {
    await vscode.window.showInformationMessage(message);
  }

  /**
   * Hand the message to the Source Control input box so the user reviews it
   * beside the diff and commits with the button they already use.
   *
   * Existing text is appended to rather than replaced — whatever the user had
   * typed is theirs, and losing it silently is worse than an odd two-line
   * draft they can edit.
   */
  async draftMessage(message: string): Promise<void> {
    if (this.repository === undefined) {
      throw new Error(
        "The built-in Git extension is unavailable, so the commit message cannot be drafted.",
      );
    }

    const existing = this.repository.inputBox.value.trim();
    this.repository.inputBox.value =
      existing.length > 0 ? `${existing}\n${message}` : message;
    await vscode.commands.executeCommand("workbench.view.scm");
  }

  async confirmSplit(groups: readonly CommitGroup[]): Promise<boolean> {
    // The modal has no formatting, so the only lever is line structure: the
    // subject alone on its line, its files indented under it, a blank line
    // between groups. Reads as a list instead of a paragraph.
    const detail = groups
      .map(
        (group, index) =>
          `${String(index + 1)}. ${group.subject}\n    ${group.paths.join("\n    ")}`,
      )
      .join("\n\n");
    const selected = await vscode.window.showWarningMessage(
      groups.length === 1
        ? "Create this commit?"
        : `Create ${String(groups.length)} separate commits?`,
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
