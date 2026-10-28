# Quality Tooling Refresh

## Approved Scope

Refresh supported dependencies and existing quality tooling.
Preserve public APIs, generated artifacts and repository-specific boundaries.

## Acceptance

- Pinact remains locked to `4.1.1` with `lint` and `upgrade`.
- The full no-fix Trunk scan and declared project gates pass.
- Changed manifests have package-manager-generated lockfiles under repository policy.
- Advisory dispositions have specific evidence and affected knowledge claims are reconciled.

## Publication

Push and PR creation require explicit repository-specific approval.
After approval, continue the requested hosted gates, merge, cleanup and memory recording.

## Compatibility Decisions

The direct development dependencies move to `@types/node` 26.6.5 and `typescript-eslint` 8.72.1.
TypeScript stays at 6.0.3 because the latest `typescript-eslint` declares the supported peer range `>=4.8.4 <6.1.0`, which excludes TypeScript 7.0.2.
Mocha stays at 11.8.0 because an actual full test run with Mocha 12.0.3 failed when the VS Code test runner loaded its own Mocha 11 instance and test imports loaded Mocha 12 hooks.
The package registry metadata is captured in the review evidence as `dependency-metadata.json`.

The existing Trunk linters move to oxipng 10.2.1, OSV-Scanner 2.7.0 and TruffleHog 3.99.7.
The remaining enabled linter versions and the existing CLI and plugin pins remain unchanged.
Pinact remains `4.1.1!` with both commands enabled.
The configured oxipng optimizer recompresses `media/banner.png` losslessly to satisfy the refreshed formatter.
An independent ImageMagick reader verifies identical decoded RGBA pixels, dimensions, bit depth and color-management metadata, after rejecting a changed-pixel control.

The README requirement is reconciled to VS Code 1.140 or later, matching `engines.vscode` and `@types/vscode` in `package.json`.
The extension version and its provider model catalog are unchanged.
Live provider verification and extension publication are outside this maintenance change.
