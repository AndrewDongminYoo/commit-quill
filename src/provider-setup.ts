import type { ProviderName, ProviderSettings } from "./llm/provider";

export type ProviderModelOption = {
  readonly label: string;
  readonly description: string;
  readonly model: string;
};

export type ProviderSetupState = {
  readonly provider?: ProviderName;
  readonly model?: string;
  readonly apiKey?: string;
};

export type ProviderSetupStep =
  | { readonly kind: "provider" }
  | { readonly kind: "model"; readonly provider: ProviderName }
  | { readonly kind: "api-key"; readonly provider: ProviderName }
  | { readonly kind: "ready"; readonly settings: ProviderSettings };

// Last checked 2026-07-31. Model IDs go stale and retired ones return 404, so
// re-verify against each provider's models endpoint before editing this list:
// OpenAI `GET /v1/models`, Anthropic `GET /v1/models`, Gemini `ListModels`.
// The "Enter a custom model ID" option is the escape hatch when this is behind.
const modelOptions = {
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

export function modelOptionsForProvider(
  provider: ProviderName,
): readonly ProviderModelOption[] {
  return modelOptions[provider];
}

export function nextProviderSetupStep(
  state: ProviderSetupState,
): ProviderSetupStep {
  if (state.provider === undefined) {
    return { kind: "provider" };
  }

  const model = state.model?.trim();
  if (model === undefined || model.length === 0) {
    return { kind: "model", provider: state.provider };
  }

  const apiKey = state.apiKey?.trim();
  if (apiKey === undefined || apiKey.length === 0) {
    return { kind: "api-key", provider: state.provider };
  }

  return {
    kind: "ready",
    settings: { provider: state.provider, model, apiKey },
  };
}
