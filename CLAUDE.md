# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A VS Code extension that generates Git commit messages through the user's own OpenAI, Anthropic, or Gemini API key — no subscription, no vendor backend.
The design contract is in `docs/specs/2026-07-31-auto-commit-msg-design.md` and the task breakdown in `docs/plans/2026-07-31-auto-commit-msg-implementation.md`; read those before changing behavior rather than restating them here.

## Commands

Package manager is pnpm (`pnpm-workspace.yaml`, `.npmrc`).

```shell
pnpm run check-types              # tsc --noEmit
pnpm run lint                     # eslint src
pnpm test                         # vscode-test — downloads/launches an Extension Host, runs out/test/**/*.test.js
pnpm run compile                  # type-check + lint + esbuild -> dist/extension.js
pnpm run package                  # same, minified (vsce:prepublish target)
pnpm run watch                    # esbuild --watch + tsc --noEmit --watch
```

`pnpm test` runs `pretest` first, which does `compile-tests` (`tsc -p . --outDir out`) plus `compile` and `lint`.

To run a single test file without booting the Extension Host — works for everything under `src/test/` except `extension.test.ts`, which imports `vscode`:

```shell
pnpm run compile-tests && pnpm exec mocha out/test/core/git.test.js
```

`F5` in VS Code launches the Extension Development Host against `test-workspace/` (see `.vscode/launch.json`).

## Architecture

Two build outputs from one source tree: esbuild bundles `src/extension.ts` into `dist/extension.js` (the shipped extension, `vscode` marked external), and `tsc` compiles everything into `out/` for the test runner.

The layering exists so that almost nothing needs VS Code to be tested:

- **`src/extension.ts`** — the only real VS Code adapter. Registers the four commands, drives QuickPick/InputBox, reads settings from the `autoCommitMsg` configuration (always `ConfigurationTarget.Global`), and stores keys in `SecretStorage` under `auto-commit-msg.api-key.<provider>`. It takes an `ExtensionRuntimeContext` (just `secrets` + `subscriptions`) rather than a full `ExtensionContext`, so `activate` is callable from tests.
- **`src/provider-setup.ts`** — pure functions: the hardcoded per-provider model catalog and `nextProviderSetupStep`, a state machine returning `provider → model → api-key → ready`. `extension.ts` translates each step into UI; the ordering logic itself is tested without VS Code.
- **`src/workflow/commit-workflow.ts`** — the orchestrator. Depends only on the `CommitLanguageModel` and `CommitUserInterface` interfaces, so tests drive it with fakes against a real temporary Git repo (`src/test/helpers/git-fixture.ts`).
- **`src/vscode-user-interface.ts`** — the sole `CommitUserInterface` implementation.
- **`src/core/git.ts`** — every Git operation, via `execFile` on the `git` binary. Never touches the built-in Git extension's API. Produces the `RepositorySnapshot` union (`clean` | `staged` | `unstaged`) that drives the whole workflow.
- **`src/llm/`** — `provider.ts` holds the shared contracts, the `createLanguageModel` factory, and `FetchHttpClient`. The injectable `HttpClient` is the seam that lets provider tests assert exact request bodies with no network. `openai.ts` / `anthropic.ts` / `gemini.ts` are one adapter each; `prompts.ts` builds both prompts; `validation.ts` parses and validates split-commit proposals with zod.

Outside `src/test/`, **`vscode` is imported only by the `extension.ts` / `vscode-*.ts` adapters** (`src/test/extension.test.ts` is the only test that imports it, which is why it needs the Extension Host).
Keep it that way — it is what makes the plain-mocha path above work.

`src/vscode-git.ts` wraps the built-in Git extension's public `getAPI(1)` surface, used only to resolve which repository the user meant and to write a drafted message into its Source Control input box. `@types/vscode` does not type that API, so the four members used are declared locally rather than vendoring a `git.d.ts`. Every Git read and mutation still goes through `src/core/git.ts`.

## Invariants worth preserving

These are load-bearing and enforced by tests:

- Staged changes always win. When anything is staged, only `git diff --cached` is sent and unstaged files are never staged or committed.
- No commit is created without the user confirming an editable subject (`CommitUserInterface.editSubject` returning `undefined` cancels the whole workflow).
- A split-commit group may only contain paths that `git status` returned; `parseGroups` rejects unknown paths, duplicates, and partial coverage before any `git add` runs.
- API keys live only in `SecretStorage`, never in settings, command arguments, or error messages.

## Conventions

Commit subjects follow the repo's detected convention; `detectConvention` falls back to Conventional Commits when the last 20 subjects show no stable prefix.

Provider model IDs are a hardcoded catalog in `src/provider-setup.ts` and go stale — verify against each provider's models endpoint before adding or trusting one.
