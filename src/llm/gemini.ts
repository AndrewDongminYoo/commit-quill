import { arrayAt, recordAt, stringAt } from "./json";
import { groupsPrompt, messagePrompt } from "./prompts";
import {
  LanguageModelError,
  MAX_OUTPUT_TOKENS,
  postForJson,
  requireMessage,
  type CommitContext,
  type CommitGroup,
  type CommitLanguageModel,
  type HttpClient,
  type ProviderSettings,
} from "./provider";
import { parseGroups } from "./validation";

export class GeminiLanguageModel implements CommitLanguageModel {
  readonly settings: ProviderSettings;
  readonly client: HttpClient;

  constructor(settings: ProviderSettings, client: HttpClient) {
    this.settings = settings;
    this.client = client;
  }

  async generateMessage(context: CommitContext): Promise<string> {
    return requireMessage(await this.request(messagePrompt(context)));
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
        generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
      }),
    });
    for (const candidate of arrayAt(body, "candidates")) {
      for (const part of arrayAt(recordAt(candidate, "content"), "parts")) {
        const text = stringAt(part, "text");
        if (text !== undefined) {
          return text;
        }
      }
    }

    throw new LanguageModelError(
      "The Gemini response did not contain candidate text.",
    );
  }
}
