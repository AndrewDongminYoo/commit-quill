# Auto Commit Message Design

## Goal

Provide a VS Code command that creates commit messages from the current Git repository without requiring a Copilot, Cursor, or Antigravity subscription.

The extension supports OpenAI, Anthropic, and Gemini directly.

No other provider is included unless requested later.

## User workflow

1. The user runs **Auto Commit Message: Generate Commit** from the Command Palette or Source Control title action.
2. The extension resolves the active workspace folder to a Git repository.
3. If the repository has staged changes, the extension analyses only the staged diff, recent commit subjects, and changed-file status.
4. The extension asks the configured provider for one commit message, shows it in an editable confirmation input, and creates a commit only after the user confirms.
5. If the repository has no staged changes but does have working-tree changes, the extension asks the provider for a structured proposal of independent file groups and suggested commit messages.
6. The extension asks whether to create the proposed split commits.
7. After confirmation, it stages exactly one proposed group, presents its editable message, commits it after confirmation, and repeats for the remaining groups.
8. If the repository has neither staged nor unstaged changes, the command ends before reading secrets or calling a provider.

## Git contract

The extension uses the installed `git` executable for all repository inspection and mutations.

It does not use undocumented internals of VS Code's built-in Git extension.

`git diff --cached` is the sole content source when staged changes exist.

Unstaged files are never staged or committed in that path.

For the split-commit path, the provider can propose only repository-relative paths returned by Git.

Before each mutation, the extension confirms that the proposal has non-empty paths and stages only those paths with `git add --`.

Each generated message remains user-editable, and cancellation stops the workflow without staging the next group or committing it.

## Commit-message contract

The extension sends the latest commit subjects with the relevant Git diff and file status to the provider.

When existing subjects reveal a stable convention, the provider must follow it.

When no convention can be inferred, the provider must use a Conventional Commit subject.

The prompt requests machine-readable JSON for split proposals and a single subject for a staged change.

The extension validates the response before any Git mutation and reports malformed responses without attempting a commit.

## Provider and secret contract

The user configures an active provider and one model name per provider in VS Code global settings.

API keys are requested through a password input and are stored separately by provider in `ExtensionContext.secrets`.

The extension never stores API keys in workspace settings, source files, command arguments, output channels, or error notifications.

OpenAI uses its native API format, Anthropic uses the Messages API format, and Gemini uses the Gemini REST format.

Provider adapters normalize successful output and report provider-specific authentication, HTTP, timeout, and malformed-response failures through a shared result contract.

## Commands and settings

The extension contributes these commands:

- `Auto Commit Message: Generate Commit`
- `Auto Commit Message: Configure Provider`
- `Auto Commit Message: Set API Key`
- `Auto Commit Message: Remove API Key`

Settings expose the active provider and model names only.

Keys are managed only with the key commands.

## Failure behavior

The command reports and stops when there is no workspace folder, no Git repository, no Git changes, no selected provider, no model name, no stored key, a Git failure, a provider failure, a malformed model response, or user cancellation.

No failure path creates a commit without the user confirming its final message.

## Verification

Unit tests cover Git-status classification, commit-convention fallback and detection, proposal validation, and native request and response adapters for all three providers.

Extension-host tests cover no-change exit, staged message generation, and the user-confirmed split-commit flow with a temporary Git repository and a local fake provider endpoint.

Manual QA runs the command in an Extension Development Host against a disposable repository for the same three outcomes.

## Must not have

The initial release does not support additional providers, automatic commits without a final user confirmation, staging paths not returned by Git, workspace-stored API keys, background commits, Git history rewriting, or a custom Source Control view.
