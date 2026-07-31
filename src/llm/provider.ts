import { AnthropicLanguageModel } from "./anthropic";
import { GeminiLanguageModel } from "./gemini";
import { OpenAiLanguageModel } from "./openai";
import type { CommitConvention } from "../core/types";

export const providerNames = ["openai", "anthropic", "gemini"] as const;

export type ProviderName = (typeof providerNames)[number];

export type ProviderSettings = {
  readonly provider: ProviderName;
  readonly model: string;
  readonly apiKey: string;
};

export type CommitContext = {
  readonly diff: string;
  readonly files: readonly string[];
  readonly convention: CommitConvention;
};

export type CommitGroup = {
  readonly subject: string;
  readonly paths: readonly string[];
};

export type HttpRequest = {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
};

export type HttpResponse = {
  readonly status: number;
  readonly body: string;
};

export interface HttpClient {
  post(request: HttpRequest): Promise<HttpResponse>;
}

export interface CommitLanguageModel {
  generateSubject(context: CommitContext): Promise<string>;
  proposeGroups(context: CommitContext): Promise<readonly CommitGroup[]>;
}

export class LanguageModelError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "LanguageModelError";
  }
}

export class FetchHttpClient implements HttpClient {
  async post(request: HttpRequest): Promise<HttpResponse> {
    try {
      const response = await fetch(request.url, {
        method: "POST",
        headers: request.headers,
        body: request.body,
        signal: AbortSignal.timeout(30_000),
      });
      return { status: response.status, body: await response.text() };
    } catch (error: unknown) {
      throw new LanguageModelError(
        "The provider request failed before receiving a response.",
        error,
      );
    }
  }
}

export function createLanguageModel(
  settings: ProviderSettings,
  client: HttpClient = new FetchHttpClient(),
): CommitLanguageModel {
  switch (settings.provider) {
    case "openai":
      return new OpenAiLanguageModel(settings, client);
    case "anthropic":
      return new AnthropicLanguageModel(settings, client);
    case "gemini":
      return new GeminiLanguageModel(settings, client);
    default:
      return assertNever(settings.provider);
  }
}

export async function postForJson(
  client: HttpClient,
  request: HttpRequest,
): Promise<unknown> {
  const response = await client.post(request);
  if (response.status < 200 || response.status >= 300) {
    throw new LanguageModelError(
      `The provider returned HTTP ${response.status}.`,
    );
  }

  try {
    return JSON.parse(response.body);
  } catch (error: unknown) {
    throw new LanguageModelError(
      "The provider response was not valid JSON.",
      error,
    );
  }
}

export function requireSubject(text: string): string {
  const subject = text.trim();
  if (subject.length === 0 || subject.includes("\n")) {
    throw new LanguageModelError(
      "The provider did not return a single commit subject.",
    );
  }

  return subject;
}

export function assertNever(value: never): never {
  throw new LanguageModelError(`Unsupported provider: ${String(value)}.`);
}
