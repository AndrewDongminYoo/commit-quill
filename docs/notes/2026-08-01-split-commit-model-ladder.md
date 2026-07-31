# Split-commit quality is a model ladder, not a prompt problem — 2026-08-01

Recorded so the prompt does not get tuned again for something tuning cannot fix.

## What was run

The same working tree, the same prompt, three models, two repositories. Both trees were the aftermath of a Trunk upgrade: the linter config changed, and the linter then rewrote other files — so a correct answer has to notice that one change caused the others.

`vscode-merry`, five files — a CI workflow with newly pinned action SHAs, the Trunk config that pinned them, and three files Prettier reformatted (two Markdown, one TypeScript test).

`wakatime-svg`, three files — a Trunk config, an editor config, and a workflow with pinned SHAs.

## What varied

Grouping was never the problem. Every model put the reformatted files together and kept the config changes apart from them, in both repositories. Four things came apart below Opus:

| Model     | Groups files sensibly | Type covers the whole group | Orders cause before effect | Subject names everything in the group |
| --------- | --------------------- | --------------------------- | -------------------------- | ------------------------------------- |
| Haiku 4.5 | yes                   | no                          | no                         | no                                    |
| Sonnet 5  | yes                   | yes                         | no                         | no                                    |
| Opus 5    | yes                   | yes                         | yes                        | yes                                   |

The concrete failures:

- **Type coverage.** Haiku labelled a group of two Markdown files and one TypeScript test `docs:`. Sonnet and Opus both called it `style:`, which covers all three. Haiku produced this twice, before and after the prompt gained an explicit rule about it.
- **Ordering.** Sonnet returned the CI workflow before the Trunk config that rewrote it, so the commits would land effect-first. Only Opus put the cause first.
- **Subject coverage.** In `wakatime-svg`, Sonnet correctly merged all three files into one commit and then titled it `chore: updates linting tool versions` — saying nothing about the action SHAs pinned in the same commit. Opus wrote `chore: updates linting tool versions and pins action SHAs`.

## Why the prompt was not changed further

Type coverage and ordering each got one prompt line, and each line was honoured by exactly the models that could already have done it unprompted and ignored by the ones that could not. Subject coverage is the same failure family as type coverage — labelling from part of a group — and Sonnet ignored it while holding the type rule, so a tenth rule would not have moved it either.

The prompt is at nine rules. The rules that work — few commits, follow the repository's convention, type covers the group — are worth more than any marginal rule, and every addition dilutes them. `commitQuill.splitModel` exists so the split can run on a model that clears the bar, rather than the prompt trying to talk a smaller one across it.

## Caveat

One run per model per repository, two repositories, both Trunk upgrades. The ordering column in particular rests on a single causal pattern (a linter config and the files it rewrote). Treat the table as the direction of the effect, not its magnitude.
