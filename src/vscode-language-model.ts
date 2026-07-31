import * as vscode from "vscode";

import type {
  CommitContext,
  CommitGroup,
  CommitLanguageModel,
} from "./llm/provider";

/**
 * Wraps a language model so every provider call shows a cancellable progress
 * notification.
 *
 * Without it the command is silent for up to the request timeout, which gives
 * the user no way to tell a slow model from a hung one and no way out. The
 * cancel button aborts the in-flight HTTP request through `controller`, which
 * is the same signal handed to the `FetchHttpClient`.
 */
export class ProgressReportingLanguageModel implements CommitLanguageModel {
  private readonly inner: CommitLanguageModel;
  private readonly controller: AbortController;

  constructor(inner: CommitLanguageModel, controller: AbortController) {
    this.inner = inner;
    this.controller = controller;
  }

  async generateSubject(context: CommitContext): Promise<string> {
    return this.reportProgress("Generating commit message…", () =>
      this.inner.generateSubject(context),
    );
  }

  async proposeGroups(context: CommitContext): Promise<readonly CommitGroup[]> {
    return this.reportProgress("Proposing commit groups…", () =>
      this.inner.proposeGroups(context),
    );
  }

  private async reportProgress<T>(
    title: string,
    run: () => Promise<T>,
  ): Promise<T> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: true,
      },
      async (_progress, token) => {
        const subscription = token.onCancellationRequested(() => {
          this.controller.abort();
        });
        try {
          return await run();
        } finally {
          subscription.dispose();
        }
      },
    );
  }
}
