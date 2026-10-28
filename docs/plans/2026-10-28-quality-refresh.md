# Quality Tooling Refresh Plan

## Work

1. Verify repository identity, instructions, current changes and Oracle precedent.
2. Refresh compatible dependency and linter versions with existing package managers.
3. Run the declared local gates and `trunk check --all --no-fix`.
4. Reconcile affected knowledge and review the scoped candidate.
5. Commit locally and prepare visible evidence before requesting publication approval.

## Declared Gates

- `pnpm install --frozen-lockfile`
- `pnpm test`
- `pnpm run package`
- `pnpm audit --json`
- `trunk check --all --no-fix --jobs=2`
- `git diff --check`

## Verification Scope

Run package commands with Node 24.22.0 and pnpm 11.18.0 to match CI.
`pnpm test` includes the `pretest` compilation, type, lint and development-bundle checks before launching the VS Code Extension Host.
`pnpm run package` checks the production bundle.
Inspect the resolved Mocha dependency graph because `@vscode/test-cli` and imported test hooks must share Mocha 11.
Keep the existing major-scoped security overrides for both paths.
Record actual command exits and limitations in the visible review evidence.
