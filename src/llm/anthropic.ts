import { z } from "zod";

import { groupsPrompt, messagePrompt } from "./prompts";
import {
  LanguageModelError,
  postForJson,
  requireMessage,
  type CommitContext,
  type CommitGroup,
  type CommitLanguageModel,
  type HttpClient,
  type ProviderSettings,
} from "./provider";
import { parseGroups } from "./validation";

const responseSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
});

export class AnthropicLanguageModel implements CommitLanguageModel {
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
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "x-api-key": this.settings.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.settings.model,
        max_tokens: 1_024,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) {
      throw new LanguageModelError(
        "The Anthropic response did not contain a text block.",
      );
    }

    const textBlock = parsed.data.content.find(
      (content) => content.type === "text" && content.text !== undefined,
    );
    if (textBlock?.text === undefined) {
      throw new LanguageModelError(
        "The Anthropic response did not contain a text block.",
      );
    }

    return textBlock.text;
  }
}
