# Implementation review — 2026-07-31

Assessment of the current tree against the stated goal: a VS Code extension that writes commit messages from the staged diff using the user's own LLM API key, splits an unstaged tree into semantic commits on request, follows the repo's existing convention (Conventional Commits as fallback), and never calls the model on a clean tree — so that this one feature stops being a reason to pay for GitLens or Copilot, or to switch editors.

Basis: full read of `src/**` (2272 lines), `pnpm run check-types` and `pnpm run lint` clean, `pnpm test` 17/17 passing, two Git behaviors reproduced in a throwaway repo, GitLens 18.3.0 read directly from `~/.vscode/extensions/eamodio.gitlens-18.3.0`, and the bundled Git extension read from the local VS Code 1.131.0 build.
Ranked: output surface and repository resolution, then correctness, then cost and UX, then publishability.

## Verdict

The engineering is solid — clean layering, a real test suite, no `vscode` import outside the two adapter files, no key ever leaving Secret Storage.
The scope matches the brief: staged → message, nothing staged → propose semantic groups and stage-commit each after approval, clean tree → exit before touching a key.
That last flow has no GitLens equivalent and is the part worth keeping exactly as designed.

What needs attention is narrower than the headline suggests: the _staged_ path diverges from GitLens in a way that costs real capability, repository resolution is single-root only, and there is one reproducible crash.

## Tier 1 — output surface and repository resolution

### 1. The staged path should write to the SCM input box, not commit

The direct-commit flow is what the brief asked for, so this is a refinement, not a correction.
But it is worth knowing exactly what GitLens does, because the difference is not stylistic.

Verified from the GitLens 18.3.0 bundle, not from memory: `gitlens.ai.generateCommitMessage` resolves the SCM repository, reads `inputBox.value` as _context_ for the prompt, shows a cancellable `ProgressLocation.Notification` titled "Generating commit message...", focuses `workbench.view.scm`, and then assigns `s.inputBox.value = ...`.
It never commits.

This extension's `CommitWorkflow.commitStaged` calls `git commit -m` after a one-line `showInputBox` confirmation (`src/workflow/commit-workflow.ts:67`).
Three consequences:

- A single-line `showInputBox` cannot express a commit body, so the staged path is structurally subject-only — no `BREAKING CHANGE:` footer, no issue trailer, no explanation.
- Review happens in a modal text field instead of beside the diff, staged-file list, and amend toggle the user already has open.
- Anything the user had already typed into the SCM box is ignored, where GitLens treats it as a prompt hint.

The hybrid honors both: **staged → write into the input box and stop** (multi-line becomes possible, the user commits with the button they already use); **unstaged split → keep committing directly**, since a stage-commit loop has nowhere else to put each message.
An `autoCommitMsg.commitDirectly` setting preserves today's behavior for anyone who prefers it.

### 2. The spec's Git-extension clause is the blocker for 1.1 and 1.3 — and it rests on a wrong premise

`docs/specs/2026-07-31-auto-commit-msg-design.md` states: _"It does not use undocumented internals of VS Code's built-in Git extension."_

`Repository.inputBox.value`, enumerating repositories in a multi-root or submodule workspace, and receiving the repository the `scm/title` menu passes as a command argument all come from the same place — and it is not an undocumented internal.
Verified in the bundled Git extension shipped with VS Code 1.131.0 (`resources/app/extensions/git/dist/main.js`): the exported object implements `getAPI(e){ ... if(e!==1) throw new Error("No API version ${e} found."); ... }`.
An explicit version parameter with a rejecting guard is a deliberate public API surface, reached via `vscode.extensions.getExtension("vscode.git")?.exports.getAPI(1)`.
GitLens uses it (`repo.git.getScmRepository()` in its bundle) while keeping its own Git CLI layer for everything else — which is exactly the split this repo would want.

So the decision is: keep the CLI-only constraint and accept that 1.1 and 1.3 stay unsolved, or narrow the clause to _undocumented_ internals and adopt the versioned API for repository resolution and the input box, while `src/core/git.ts` keeps owning every read and mutation.

Real cost of the second option, so it is not underestimated: a runtime guard that `getExtension("vscode.git")` exists and is activated (or an `extensionDependencies` entry), and a vendored `git.d.ts` — `@types/vscode` does not type this API, and the shipped extension has no `src/` directory, so the declarations have to be copied from the `microsoft/vscode` repo and kept in sync.

### 3. Repository resolution is single-root only

`activeWorkspacePath()` returns `workspaceFolders?.[0]?.uri.fsPath` (`src/extension.ts:215`).
In a multi-root workspace the command silently operates on the wrong repository; with a submodule or a repo nested below the folder root, `getRepositoryRoot` walks up and may target the parent.
Meanwhile the `scm/title` contribution already hands the invoked repository to the command as an argument, and it is discarded — `generateCommit` takes no parameters.

Minimum fix without touching the spec clause: accept the SCM argument when present, and fall back to a QuickPick over `workspaceFolders` when there is more than one.

## Tier 2 — correctness

### 4. An untracked _directory_ crashes the whole command

Reproduced: `git status --porcelain=v1 -z` reports an untracked directory as a single entry `?? newdir/`, not its files.
`unstagedDiff` then calls `readUntrackedFile(cwd, "newdir/")` → `readFile` on a directory → `EISDIR`, which propagates out of `inspectRepository` and surfaces as a raw Node error notification.

Any user who adds a new folder and runs the command on an unstaged tree hits this.
The fix is `--untracked-files=all` on the status invocation in `src/core/git.ts:32`, so git enumerates the files rather than the directory.

**Do not ship that one-liner alone.** Today, an unignored `node_modules` or any large untracked tree hits the `EISDIR` crash, which is accidentally acting as a guard. With `-uall` and nothing else, git enumerates every file, `readUntrackedFile` reads each as UTF-8, and the lot is sent to the provider — turning a loud crash into a silent multi-megabyte billed request. Ship it together with findings 5 and 6.

### 5. Untracked binaries are read as UTF-8 and shipped to the provider

`readUntrackedFile` (`src/core/git.ts:161`) reads every untracked path with `"utf8"` and inlines the whole content into a fabricated diff.
A new PNG, a `.zip`, or a 20 MB fixture becomes mojibake in the prompt — billed, and in the large case a request that fails or blows the context window.
`git diff --no-index /dev/null <path>` gives a real diff and reports `Binary files differ` instead; or filter by a size cap and a NUL-byte probe.

### 6. No bound on diff size

Neither path truncates.
A large staged diff is sent whole, on the user's own key, with no warning.
GitLens exposes this as a configurable character budget; a `autoCommitMsg.maxDiffCharacters` setting with a sane default (and a notice when it truncates) is the smallest useful version.

### 7. `requireSubject` throws on any multi-line response

`requireSubject` (`src/llm/provider.ts:110`) rejects text containing `\n`, so a model that returns a subject followed by a body — which is exactly what a repo whose convention examples have bodies will elicit — aborts the workflow with "The provider did not return a single commit subject."
Taking the first non-empty line is strictly better than failing, and becomes the right behavior anyway once the message can carry a body (tier 1.1).

### 8. Provider errors are reduced to a status code

`postForJson` (`src/llm/provider.ts:94`) throws `The provider returned HTTP ${status}` and discards the response body.
An invalid key, an unavailable model, and an exhausted quota are all "HTTP 400" to the user, with the actual explanation sitting unread in `response.body`.
Since keys are only ever in headers, echoing a bounded slice of the body is safe and turns the top support question into a self-service fix.

### 9. Split-commit failures leave the repo half-committed, and success is silent

`commitUnstaged` loops staging and committing each group (`src/workflow/commit-workflow.ts:86`).
A `git commit` failure on group 3 of 5 throws out of the loop; two commits already exist and the error message says nothing about them.
Separately, `generateCommit` ignores the returned `WorkflowOutcome` entirely (`src/extension.ts:83`), so a successful three-commit split produces no confirmation at all.

At minimum: report which groups committed when the loop aborts, and surface `{kind: "committed", count}` as an information message.

## Tier 3 — cost and UX

### 10. No progress indicator and no cancellation

`FetchHttpClient` uses a 30-second `AbortSignal.timeout` and nothing else (`src/llm/provider.ts:61`).
The user gets an unexplained pause of up to 30 seconds per request, with no way to cancel and no way to tell a slow model from a hung one.
GitLens wraps the same call in `window.withProgress` with `ProgressLocation.Notification` and a cancellation token; that is the pattern to copy.

### 11. No custom-instructions setting

GitLens ships `gitlens.ai.generateCommitMessage.customInstructions`, and it is one of the main reasons the feature is usable across teams with house conventions.
`prompts.ts` is 17 lines and the hook is a one-line concatenation.

### 12. The model catalog is already stale — one entry is retired

`src/provider-setup.ts` offers `claude-3-5-haiku-20241022` (line 52), which was retired on 2026-02-19 and now returns 404 — a user picking "Claude Haiku 3.5" gets an unexplained failure (worsened by finding 8).
`claude-sonnet-4-20250514` (line 43) and `claude-opus-4-1-20250805` (line 48) are both deprecated with announced retirement dates in 2026.
The current Anthropic line is Fable 5 / Opus 5 / Sonnet 5 / Haiku 4.5; GitLens' own settings documentation uses `openai:gpt-5.5` and `anthropic:claude-sonnet-5` as its examples.
The OpenAI and Gemini entries could not be verified against a source in this session — treat them as unknown rather than correct.

The curated-list-plus-custom-ID decision is sound and should stay.
What should change is where the list comes from: all three providers expose a models endpoint (`GET /v1/models` on OpenAI and Anthropic, `ListModels` on Gemini), so the QuickPick can be populated from the user's own key with the static list as the offline fallback.
That also fixes the related problem that the catalog advertises models a given account may not have access to.
Until then, the list needs a refresh and a dated comment saying when it was last checked.

### 13. Output token caps are inconsistent

Anthropic gets `max_tokens: 1024` (`src/llm/anthropic.ts:50`); OpenAI and Gemini get no cap at all.
For a reasoning model on the OpenAI Responses path, an uncapped request can spend materially more than the task needs.

## Tier 4 — publishability

### 14. The manifest cannot be published as-is

`package.json` has no `publisher`, `license`, `repository`, `icon`, or `keywords`; there is no `LICENSE` file; `displayName` is the raw slug `auto-commit-msg`; and `categories` is `["Other"]` rather than `SCM Providers` / `AI`.
`vsce package` will refuse or emit warnings, and the result would be unlistable in the Marketplace.
For a product whose entire premise is "the free alternative to a paid feature", shipping is part of the feature — this belongs in the next commit, not in a polish pass.

### 15. `test-workspace/` is not ignored

`.gitignore` covers `out`, `dist`, `node_modules`, `.vscode-test/`, and `*.vsix` — not `test-workspace/`, which `.vscode/launch.json` opens as the Extension Development Host workspace and which therefore accumulates scratch files during manual testing.
Only `.gitkeep` is tracked today, but there is already an untracked file sitting in it.
Add `test-workspace/*` with `!test-workspace/.gitkeep`.

## Not problems

Worth recording so they are not re-litigated:

- The **split-commit flow is requested scope**, not scope creep, and it has no GitLens equivalent — GitLens only writes a message for what is already staged. It is the differentiating feature here and should not be traded away for parity.
- The **clean-tree early exit** (`src/extension.ts:73`) does the thing the brief specifically asked for: it returns before reading a key or calling a provider.
- The `--porcelain=v1 -z` rename parse is **correct**. Verified: git emits `R  new.txt\0old.txt\0` — new path first — so `part.slice(3)` takes the new path and the index skip consumes the old one.
- Raw `fetch` for all three providers instead of vendor SDKs is the right call for a VSIX: three SDKs would dominate the bundle to save perhaps 40 lines, and `HttpClient` already gives the tests a clean seam.
- The zod response schemas are appropriately narrow, and `parseGroups` correctly refuses any path git did not report, any duplicate, and any proposal that fails to cover the working tree.

## Suggested order

1. Findings 4 + 5 + 6 as one change: `--untracked-files=all`, binary/size filtering for untracked files, and a diff-character cap. They must land together — see the warning under finding 4.
2. `test-workspace/` ignore, publishable manifest + LICENSE, refreshed model catalog with a dated comment. Mechanical, unblocks shipping.
3. Decide the tier 1.2 question — CLI-only, or adopt the versioned `vscode.git` API. Tier 1.1 and 1.3 both wait on that answer.
4. Progress + cancellation, provider error bodies, first-line subject extraction, split-loop failure reporting and success confirmation.
5. Custom instructions, output token caps, model list fetched from the provider with the static catalog as fallback.
