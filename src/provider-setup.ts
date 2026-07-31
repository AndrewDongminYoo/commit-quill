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

const modelOptions = {
  openai: [
    {
      label: "GPT-5 mini",
      description: "Recommended for fast, cost-efficient commit messages.",
      model: "gpt-5-mini",
    },
    {
      label: "GPT-5.1",
      description: "Higher-capability reasoning for complex changes.",
      model: "gpt-5.1",
    },
    {
      label: "GPT-4.1",
      description: "A non-reasoning alternative for focused tasks.",
      model: "gpt-4.1",
    },
  ],
  anthropic: [
    {
      label: "Claude Sonnet 4",
      description: "Recommended balance of quality and speed.",
      model: "claude-sonnet-4-20250514",
    },
    {
      label: "Claude Opus 4.1",
      description: "Highest capability for complex changes.",
      model: "claude-opus-4-1-20250805",
    },
    {
      label: "Claude Haiku 3.5",
      description: "Fastest option for straightforward changes.",
      model: "claude-3-5-haiku-20241022",
    },
  ],
  gemini: [
    {
      label: "Gemini 3.6 Flash",
      description: "Recommended current balance of speed and intelligence.",
      model: "gemini-3.6-flash",
    },
    {
      label: "Gemini 3.5 Flash",
      description: "Higher intelligence for sustained coding tasks.",
      model: "gemini-3.5-flash",
    },
    {
      label: "Gemini 3.5 Flash-Lite",
      description: "Fastest, lowest-cost option for simple changes.",
      model: "gemini-3.5-flash-lite",
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
