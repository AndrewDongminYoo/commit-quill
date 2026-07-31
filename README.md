# Auto Commit Message

Generate reviewed Git commit messages in VS Code with your own OpenAI, Anthropic, or Gemini API key.

The extension never commits without showing an editable commit subject and receiving your confirmation.

## Requirements

- VS Code 1.125 or later.
- Git available on the VS Code extension host's `PATH`.
- An API key for OpenAI, Anthropic, or Gemini.

## Setup

1. Run **Auto Commit Message: Generate Commit** from the Command Palette or the sparkle icon in the Source Control title bar.
2. If required, select a provider, select one of its listed models (or enter a custom model ID), and enter its API key.

Selecting a provider always shows its model list.
When that provider already has a stored key, setup ends after model selection.
Otherwise, it immediately asks for the key.

Model names are stored in VS Code global settings.

Keys are stored separately per provider in VS Code Secret Storage and are never written to workspace settings.

## Commit behavior

When staged changes exist, the extension sends only the staged diff, staged file list, and recent commit subjects to the selected provider.

It follows a detected stable local commit convention.

When no stable convention exists, it asks for a Conventional Commit subject.

The generated subject is always editable before Git commits it.

When no files are staged but the working tree has changes, the extension asks the provider to propose independent file groups.

It shows the proposal and stages and commits each group only after approval.

When the working tree is clean, the command exits before reading an API key or calling a provider.

## Supported providers

- OpenAI Responses API.
- Anthropic Messages API.
- Gemini `generateContent` REST API.

Other providers are intentionally out of scope until requested.

## Safety

- Existing staged changes take precedence over unstaged changes.
- The extension does not stage unstaged files when staged changes exist.
- Split groups may contain only paths returned by Git status.
- A malformed provider response, a Git failure, a missing model or key, or cancellation stops the workflow without creating a new commit.

## Development

```shell
pnpm install
pnpm test
pnpm run package
```
