import { z } from "zod";

import { groupsPrompt, subjectPrompt } from "./prompts";
import {
  LanguageModelError,
  postForJson,
  requireSubject,
  type CommitContext,
  type CommitGroup,
  type CommitLanguageModel,
  type HttpClient,
  type ProviderSettings,
} from "./provider";
import { parseGroups } from "./validation";

const responseSchema = z.object({
  candidates: z.array(
    z.object({
      content: z.object({
        parts: z.array(z.object({ text: z.string().optional() })),
      }),
    }),
  ),
});

export class GeminiLanguageModel implements CommitLanguageModel {
  readonly settings: ProviderSettings;
  readonly client: HttpClient;

  constructor(settings: ProviderSettings, client: HttpClient) {
    this.settings = settings;
    this.client = client;
  }

  async generateSubject(context: CommitContext): Promise<string> {
    return requireSubject(await this.request(subjectPrompt(context)));
  }

  async proposeGroups(context: CommitContext): Promise<readonly CommitGroup[]> {
    return parseGroups(
      await this.request(groupsPrompt(context)),
      context.files,
    );
  }

  private async request(prompt: string): Promise<string> {
    const body = await postForJson(this.client, {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.settings.model)}:generateContent`,
      headers: {
        "x-goog-api-key": this.settings.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    });
    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) {
      throw new LanguageModelError(
        "The Gemini response did not contain candidate text.",
      );
    }

    for (const candidate of parsed.data.candidates) {
      for (const part of candidate.content.parts) {
        if (part.text !== undefined) {
          return part.text;
        }
      }
    }

    throw new LanguageModelError(
      "The Gemini response did not contain candidate text.",
    );
  }
}
