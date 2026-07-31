import { arrayAt, stringAt } from "./json";
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
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    for (const block of arrayAt(body, "content")) {
      const text = stringAt(block, "text");
      if (stringAt(block, "type") === "text" && text !== undefined) {
        return text;
      }
    }

    throw new LanguageModelError(
      "The Anthropic response did not contain a text block.",
    );
  }
}
