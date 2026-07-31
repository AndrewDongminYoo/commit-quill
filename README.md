# Commit Quill

![Commit Quill](media/banner.png)

Generate reviewed Git commit messages in VS Code with your own OpenAI, Anthropic, or Gemini API key.

The extension never commits without showing an editable commit subject and receiving your confirmation.

## Requirements

- VS Code 1.125 or later.
- Git available on the VS Code extension host's `PATH`.
- An API key for OpenAI, Anthropic, or Gemini.

## Setup

1. Run **Commit Quill: Generate Commit** from the Command Palette or the sparkle icon in the Source Control title bar.
2. If required, select a provider, select one of its listed models (or enter a custom model ID), and enter its API key.

Selecting a provider always shows its model list.
When that provider already has a stored key, setup ends after model selection.
Otherwise, it immediately asks for the key.

Model names are stored in VS Code global settings.

Keys are stored separately per provider in VS Code Secret Storage and are never written to workspace settings.

## Commit behavior

When staged changes exist, the extension sends only the staged diff, staged file list, and recent commit subjects to the selected provider.

The generated subject is written into the Source Control input box, where you review it beside your diff and commit with the button you already use. Text already in the box is kept and the subject is appended after it. Set `commitQuill.commitDirectly` to confirm and commit in one step instead.

Diffs are truncated at `commitQuill.maxDiffCharacters` (64000 by default), and untracked files that are binary or larger than 128 KB are named rather than sent. You are told whenever either happens.

Lockfiles and generated project files are replaced by a line count before any of this, because they are usually the largest and least informative part of a diff. In one measured commit a `package-lock.json` regeneration was 86% of the diff and more than twice the whole character budget on its own, which pushed every source file past the cut — the model would have seen nothing but lockfile noise. Collapsing it moved the first source file from character 140,972 to 4,890. `commitQuill.collapsedPaths` holds the globs; set it to `[]` to send everything.

Each provider call shows a cancellable progress notification. Cancelling aborts the in-flight request and ends the command without creating a commit.

It follows a detected stable local commit convention. Anything you put in `commitQuill.customInstructions` is appended after that and takes precedence over it, which is where a house convention or a required issue trailer belongs.

When no stable convention exists, it asks for a Conventional Commit subject.

The generated subject is always editable before Git commits it.

When no files are staged but the working tree has changes, the extension asks the provider to propose independent file groups.

Grouping files by why they changed is a harder task than summarising one staged diff, and it does not degrade gracefully — it comes apart in distinct pieces as the model gets smaller. Measured across two repositories:

| Model     | Groups files sensibly | Type covers the whole group | Orders cause before effect | Subject names everything in the group |
| --------- | --------------------- | --------------------------- | -------------------------- | ------------------------------------- |
| Haiku 4.5 | yes                   | no                          | no                         | no                                    |
| Sonnet 5  | yes                   | yes                         | no                         | no                                    |
| Opus 5    | yes                   | yes                         | yes                        | yes                                   |

Every model grouped the files correctly; what varied was the labelling. Point `commitQuill.splitModel` at a stronger model on the same provider to run only the split there, without paying for it on every ordinary commit.

Set `commitQuill.splitUnstagedChanges` to `false` to skip splitting entirely: you get one message describing the whole working tree, written to the Source Control input box with nothing staged and nothing committed.

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
