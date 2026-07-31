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
      body: JSON.stringify({
        model: this.settings.model,
        input,
        max_output_tokens: MAX_OUTPUT_TOKENS,
      }),
    });
    for (const output of arrayAt(body, "output")) {
      for (const content of arrayAt(output, "content")) {
        const text = stringAt(content, "text");
        if (stringAt(content, "type") === "output_text" && text !== undefined) {
          return text;
        }
      }
    }

    throw new LanguageModelError(
      "The OpenAI response did not contain output text.",
    );
  }
}
