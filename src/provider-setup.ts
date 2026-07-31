import { modelCatalog, type ProviderModelOption } from "./llm/model-catalog";
import type { ProviderName, ProviderSettings } from "./llm/provider";

export type { ProviderModelOption };

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

export function modelOptionsForProvider(
  provider: ProviderName,
): readonly ProviderModelOption[] {
  return modelCatalog[provider];
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
