import type { ProviderName } from "./provider";

export type ProviderModelOption = {
  readonly label: string;
  readonly description: string;
  readonly model: string;
};

/**
 * When these entries were last checked against each provider's models
 * endpoint. Run `pnpm run verify:models` to re-check and update it — a retired
 * ID returns 404 at generation time, which is a miserable way to find out.
 */
export const catalogVerifiedOn = "2026-07-31";

/**
 * Three curated choices per provider: a cost-efficient default, a balanced
 * option, and the highest-capability one. Deliberately short — a commit message
 * is a small task, and the "Enter a custom model ID" option covers anything an
 * individual account has that this list does not.
 */
export const modelCatalog = {
  openai: [
    {
      label: "GPT-5.4 mini",
      description: "Recommended for fast, cost-efficient commit messages.",
      model: "gpt-5.4-mini",
    },
    {
      label: "GPT-5.4",
      description: "Higher-capability reasoning for complex changes.",
      model: "gpt-5.4",
    },
    {
      label: "GPT-5.5",
      description: "Highest capability for large or subtle diffs.",
      model: "gpt-5.5",
    },
  ],
  anthropic: [
    {
      label: "Claude Haiku 4.5",
      description: "Recommended for fast, cost-efficient commit messages.",
      model: "claude-haiku-4-5",
    },
    {
      label: "Claude Sonnet 5",
      description: "Balance of quality and speed.",
      model: "claude-sonnet-5",
    },
    {
      label: "Claude Opus 5",
      description: "Highest capability for large or subtle diffs.",
      model: "claude-opus-5",
    },
  ],
  gemini: [
    {
      label: "Gemini 3.1 Flash-Lite",
      description: "Recommended for fast, cost-efficient commit messages.",
      model: "gemini-3.1-flash-lite",
    },
    {
      label: "Gemini 3.5 Flash",
      description: "Balance of speed and intelligence.",
      model: "gemini-3.5-flash",
    },
    {
      label: "Gemini 3.1 Pro",
      description: "Highest capability for large or subtle diffs.",
      model: "gemini-3.1-pro-preview",
    },
  ],
} satisfies Readonly<Record<ProviderName, readonly ProviderModelOption[]>>;
