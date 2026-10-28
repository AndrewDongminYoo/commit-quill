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
- `python3 -m unittest discover -s .trunk/configs/tests -p 'test_trufflehog_to_sarif.py'`
- `trunk check --all --no-fix --jobs=2`
- `git diff --check`

## Verification Scope

Run package commands with Node 24.22.0 and pnpm 11.18.0 to match CI.
`pnpm test` includes the `pretest` compilation, type, lint and development-bundle checks before launching the VS Code Extension Host.
`pnpm run package` checks the production bundle.
Inspect the resolved Mocha dependency graph because `@vscode/test-cli` and imported test hooks must share Mocha 11.
Keep the installed major lines separate when raising the `brace-expansion` floors to 1.1.21, 2.1.7 and 5.0.12.
Scope the `serialize-javascript` override to Mocha 11 after checking that it is the sole consumer; raise its floor to 7.1.4 to cover GHSA-m5mm-p8h7-m29v and retain the existing `js-yaml` and `diff` floors.
After regenerating the lockfile and running a frozen install, compare all lockfile content outside override metadata, the full installed graph and affected runtime module resolutions with the baseline.
Reject altered-input controls before trusting the comparison.
If those readers confirm an unchanged dependency graph and module resolutions, retain the previous 55-test Extension Host evidence without repeating that suite; rerun the package audit and full no-fix Trunk scan for the override change.
Record actual command exits and limitations in the visible review evidence.

## Security Reader Follow-up

Replace the inherited network-verifying `--only-verified` filesystem command with `--no-verification --no-update` and the reviewed local JSONL-to-SARIF reader.
Preserve the inherited SARIF output, success codes `0` and `183`, and `copy_targets` sandbox.
Run the encoded-finding regression against the inherited reader and observe its failure before running all 10 local reader tests.
Use the cached TruffleHog 3.99.7 binary with never-issued synthetic fixtures to compare encoded, literal and clean results through both readers without provider verification.
Retain only sanitized findings metadata and remove temporary fixtures and raw diagnostics.
After a heavy execution slot is available, run the configured-Trunk encoded, literal and clean controls and the full no-fix scan.
Keep the existing dependency graph, lockfile and runtime-resolution evidence because this follow-up does not change their inputs.
