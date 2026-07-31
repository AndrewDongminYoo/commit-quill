# Change Log

All notable changes to the "commit-quill" extension will be documented in this file.

## [0.0.2] — 2026-08-01

First published release. Nothing before this reached the Marketplace.

### Added

- Commit messages for staged changes through your own OpenAI, Anthropic, or Gemini API key, written into the Source Control input box for review. Set `commitQuill.commitDirectly` to confirm and commit in one step instead.
- Splitting an unstaged working tree into semantic commits, staged and committed one group at a time after you approve the proposal.
- Guided setup that asks for whichever of provider, model, and API key is missing, in that order. Keys live only in VS Code Secret Storage.
- `commitQuill.customInstructions` for a house convention, appended after the convention detected from recent commits and taking precedence over it.
- `commitQuill.splitModel` to run only the split proposal on a stronger model. Grouping files by why they changed is a harder task than summarising one staged diff — see the README for what was measured.
- `commitQuill.splitUnstagedChanges` to skip splitting and describe the whole tree in one message, staging nothing.
- A cancellable progress notification on every provider call; cancelling aborts the request rather than waiting out the timeout.

### Notes on what reaches the provider

- Lockfiles and generated project files are replaced by a line count. One measured `package-lock.json` regeneration was 86% of the diff and more than twice the character budget on its own, which pushed every source file past the truncation point.
- Diffs are capped at `commitQuill.maxDiffCharacters`; untracked files that are binary or over 128 KB are named rather than read. You are told whenever anything was withheld.
- Renames are reported as such, so a moved file is not described as a new one.
- API keys travel in request headers only, never in a prompt, a setting, or an error message.
