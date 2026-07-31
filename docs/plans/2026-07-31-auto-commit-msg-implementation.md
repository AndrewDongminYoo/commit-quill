# Auto Commit Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a VS Code extension that generates user-confirmed Git commit messages and split commits through native OpenAI, Anthropic, and Gemini APIs.

**Architecture:** Keep Git process execution, convention analysis, provider protocol translation, and command orchestration as independently testable modules. The VS Code entry point is a thin adapter that reads global configuration, stores provider keys in `ExtensionContext.secrets`, and presents user confirmations.

**Tech Stack:** TypeScript, VS Code Extension API, Node.js child processes and fetch, Zod, Mocha, `@vscode/test-electron`.

## Global Constraints

- Support only OpenAI, Anthropic, and Gemini.
- Store API keys only in `ExtensionContext.secrets`.
- Use only Git-returned repository-relative paths when staging a split group.
- Never call a provider if the working tree has no staged or unstaged changes.
- Never create a commit until the user confirms the editable final subject.
- Preserve unstaged changes whenever staged changes exist.

---

### Task 1: Git state and commit-convention core

**Files:**

- Create: `src/core/git.ts`
- Create: `src/core/convention.ts`
- Create: `src/core/types.ts`
- Create: `src/test/core/git.test.ts`
- Create: `src/test/core/convention.test.ts`

**Interfaces:**

- Produces `inspectRepository(cwd: string): Promise<RepositorySnapshot>`.
- Produces `detectConvention(subjects: readonly string[]): CommitConvention`.
- Produces `stagePaths(cwd: string, paths: readonly string[]): Promise<void>` and `commit(cwd: string, subject: string): Promise<void>`.

- [ ] **Step 1: Write failing tests for empty, staged, and unstaged Git snapshots.**

```typescript
it("classifies a repository with no changes as clean", async () => {
  const snapshot = await inspectRepository(fixture.repositoryPath);
  assert.strictEqual(snapshot.kind, "clean");
});
```

- [ ] **Step 2: Run the focused Git tests and verify they fail because the module does not exist.**

Run: `pnpm exec mocha out/test/core/git.test.js`

Expected: module-resolution failure for `src/core/git`.

- [ ] **Step 3: Implement typed Git process execution and snapshot classification.**

```typescript
type RepositorySnapshot =
  | { readonly kind: "clean" }
  | {
      readonly kind: "staged";
      readonly diff: string;
      readonly files: readonly string[];
      readonly subjects: readonly string[];
    }
  | {
      readonly kind: "unstaged";
      readonly diff: string;
      readonly files: readonly string[];
      readonly subjects: readonly string[];
    };
```

- [ ] **Step 4: Add failing convention tests for a detected local style and Conventional Commit fallback.**

```typescript
it("uses Conventional Commit guidance when subjects have no stable prefix", () => {
  assert.strictEqual(detectConvention([]).kind, "conventional");
});
```

- [ ] **Step 5: Implement convention detection and run both core test files.**

Run: `pnpm run compile-tests && pnpm exec mocha out/test/core/git.test.js out/test/core/convention.test.js`

Expected: all tests pass.

### Task 2: Provider adapters and validated LLM output

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/llm/provider.ts`
- Create: `src/llm/openai.ts`
- Create: `src/llm/anthropic.ts`
- Create: `src/llm/gemini.ts`
- Create: `src/llm/prompts.ts`
- Create: `src/test/llm/providers.test.ts`

**Interfaces:**

- Consumes `RepositorySnapshot` and `CommitConvention` from Task 1.
- Produces `CommitLanguageModel.generateSubject(context: CommitContext): Promise<string>`.
- Produces `CommitLanguageModel.proposeGroups(context: CommitContext): Promise<readonly CommitGroup[]>`.

- [ ] **Step 1: Add Zod as the runtime parser for provider payloads and lock it with `pnpm install`.**

```json
{
  "dependencies": {
    "zod": "^4.0.0"
  }
}
```

- [ ] **Step 2: Write failing adapter tests for each native request format and successful response extraction.**

```typescript
it("extracts text from an Anthropic Messages response", async () => {
  const result = await adapter.generateSubject(context);
  assert.strictEqual(result, "feat: add commit command");
});
```

- [ ] **Step 3: Implement native adapter request builders and Zod response parsing.**

```typescript
interface CommitLanguageModel {
  generateSubject(context: CommitContext): Promise<string>;
  proposeGroups(context: CommitContext): Promise<readonly CommitGroup[]>;
}
```

- [ ] **Step 4: Validate split proposals against the exact Git-returned file set before exposing them to the command workflow.**

```typescript
function validateGroups(
  groups: readonly CommitGroup[],
  allowedPaths: ReadonlySet<string>,
): readonly CommitGroup[];
```

- [ ] **Step 5: Run provider tests, type checking, and linting.**

Run: `pnpm run check-types && pnpm run lint && pnpm exec mocha out/test/llm/providers.test.js`

Expected: all checks pass.

### Task 3: User-confirmed commit workflow

**Files:**

- Create: `src/workflow/commit-workflow.ts`
- Create: `src/workflow/user-interface.ts`
- Create: `src/test/workflow/commit-workflow.test.ts`

**Interfaces:**

- Consumes `RepositorySnapshot`, Git mutation functions, and `CommitLanguageModel`.
- Produces `runCommitWorkflow(cwd: string): Promise<WorkflowOutcome>`.

- [ ] **Step 1: Write failing workflow tests for clean exit, staged-only commit, rejected split proposal, and cancellation between groups.**

```typescript
it("does not request a model response for a clean repository", async () => {
  const outcome = await workflow.run(fixture.cleanRepository);
  assert.strictEqual(outcome.kind, "nothing-to-commit");
});
```

- [ ] **Step 2: Implement the clean and staged paths with injected UI and provider interfaces.**

```typescript
type WorkflowOutcome =
  | { readonly kind: "nothing-to-commit" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "committed"; readonly count: number };
```

- [ ] **Step 3: Implement the unstaged split proposal path, staging one validated group only after an explicit approval.**

```typescript
interface CommitUserInterface {
  confirmSplit(groups: readonly CommitGroup[]): Promise<boolean>;
  editSubject(subject: string): Promise<string | undefined>;
}
```

- [ ] **Step 4: Run the workflow tests against disposable local Git repositories.**

Run: `pnpm run compile-tests && pnpm exec mocha out/test/workflow/commit-workflow.test.js`

Expected: all workflow tests pass.

### Task 4: VS Code integration and secure configuration

**Files:**

- Modify: `package.json`
- Modify: `src/extension.ts`
- Modify: `README.md`
- Modify: `src/test/extension.test.ts`

**Interfaces:**

- Consumes `runCommitWorkflow(cwd: string)` from Task 3.
- Produces the four contributed commands and provider/model global settings.

- [ ] **Step 1: Write failing extension-host tests that assert command registration and no-change command completion.**

```typescript
test("registers the generate commit command", async () => {
  assert.strictEqual(
    await vscode.commands
      .getCommands(true)
      .then((commands) => commands.includes("auto-commit-msg.generateCommit")),
    true,
  );
});
```

- [ ] **Step 2: Replace the Hello World contribution with the four specified commands, configuration schema, and Source Control title action.**

```json
{
  "command": "auto-commit-msg.generateCommit",
  "title": "Auto Commit Message: Generate Commit"
}
```

- [ ] **Step 3: Wire `ExtensionContext.secrets` to password-input set/remove-key commands and global model/provider settings.**

```typescript
await context.secrets.store(`auto-commit-msg.${provider}.apiKey`, key);
```

- [ ] **Step 4: Wire the Generate Commit command to the workspace Git root and the Task 3 UI adapter.**

- [ ] **Step 5: Update README configuration and usage documentation, then run compile, lint, and extension-host tests.**

Run: `pnpm test`

Expected: all extension checks pass.

### Task 5: Package and manual QA

**Files:**

- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Consumes the packaged extension built by Task 4.
- Produces evidence for the clean, staged, and split-commit user-visible workflows.

- [ ] **Step 1: Package the extension with the production build command.**

Run: `pnpm run package`

Expected: TypeScript, lint, and esbuild complete successfully.

- [ ] **Step 2: Start an Extension Development Host and run Generate Commit on a disposable clean Git repository.**

Expected: the command reports nothing to commit and makes no provider request.

- [ ] **Step 3: Run Generate Commit with a staged fixture and confirm the editable generated subject before committing.**

Expected: only the staged fixture file is committed.

- [ ] **Step 4: Run Generate Commit with multiple unstaged fixture files, approve splitting, and confirm each editable subject.**

Expected: each proposed group is staged and committed separately with no unrelated paths included.

- [ ] **Step 5: Record the manual QA results in README and changelog, then rerun `pnpm test` and `pnpm run package`.**

Expected: all automated checks pass after documentation updates.
