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
  output: z.array(
    z.object({
      type: z.string(),
      content: z.array(
        z.object({ type: z.string(), text: z.string().optional() }),
      ),
    }),
  ),
});

export class OpenAiLanguageModel implements CommitLanguageModel {
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

  private async request(input: string): Promise<string> {
    const body = await postForJson(this.client, {
      url: "https://api.openai.com/v1/responses",
      headers: {
        Authorization: `Bearer ${this.settings.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: this.settings.model, input }),
    });
    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) {
      throw new LanguageModelError(
        "The OpenAI response did not contain output text.",
      );
    }

    for (const output of parsed.data.output) {
      for (const content of output.content) {
        if (content.type === "output_text" && content.text !== undefined) {
          return content.text;
        }
      }
    }

    throw new LanguageModelError(
      "The OpenAI response did not contain output text.",
    );
  }
}
