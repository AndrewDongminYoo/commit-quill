import { z } from "zod";

import { AnthropicLanguageModel } from "./anthropic";
import { GeminiLanguageModel } from "./gemini";
import { OpenAiLanguageModel } from "./openai";
import type { CommitConvention } from "../core/types";

const MAX_ERROR_DETAIL = 300;

// OpenAI, Anthropic, and Gemini all nest their human-readable failure reason
// here, so one schema covers every provider.
const errorBodySchema = z.object({
  error: z.object({ message: z.string().min(1) }),
});

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

/** Thrown when the user cancels a request, so callers can stay silent. */
export class LanguageModelCancelledError extends Error {
  constructor() {
    super("The commit-message request was cancelled.");
    this.name = "LanguageModelCancelledError";
  }
}

export class FetchHttpClient implements HttpClient {
  private readonly cancellation: AbortSignal | undefined;

  constructor(cancellation?: AbortSignal) {
    this.cancellation = cancellation;
  }

  async post(request: HttpRequest): Promise<HttpResponse> {
    const timeout = AbortSignal.timeout(30_000);
    const signal =
      this.cancellation === undefined
        ? timeout
        : AbortSignal.any([timeout, this.cancellation]);
    try {
      const response = await fetch(request.url, {
        method: "POST",
        headers: request.headers,
        body: request.body,
        signal,
      });
      return { status: response.status, body: await response.text() };
    } catch (error: unknown) {
      // A user-initiated abort is not a failure — do not dress it up as one.
      if (this.cancellation?.aborted === true) {
        throw new LanguageModelCancelledError();
      }

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
      `The provider returned HTTP ${response.status}.${errorDetail(response.body)}`,
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

// Providers explain *why* a request failed only in the response body: a wrong
// key, a retired model, and an exhausted quota otherwise look identical.
// Safe to surface — API keys travel in headers, never in the body.
function errorDetail(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return "";
  }

  const detail = readErrorMessage(trimmed) ?? trimmed;
  return detail.length > MAX_ERROR_DETAIL
    ? ` ${detail.slice(0, MAX_ERROR_DETAIL)}…`
    : ` ${detail}`;
}

function readErrorMessage(body: string): string | undefined {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(body);
  } catch {
    return undefined;
  }

  const parsed = errorBodySchema.safeParse(parsedJson);
  return parsed.success ? parsed.data.error.message.trim() : undefined;
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
