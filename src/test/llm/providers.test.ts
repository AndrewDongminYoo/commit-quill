import * as assert from "node:assert";
import { test } from "mocha";

import {
  createLanguageModel,
  type CommitContext,
  type HttpClient,
  type HttpRequest,
  type HttpResponse,
} from "../../llm/provider";

class RecordingHttpClient implements HttpClient {
  readonly response: HttpResponse;
  request: HttpRequest | undefined;

  constructor(response: HttpResponse) {
    this.response = response;
  }

  async post(request: HttpRequest): Promise<HttpResponse> {
    this.request = request;
    return this.response;
  }
}

const context: CommitContext = {
  diff: "diff --git a/src/extension.ts b/src/extension.ts",
  files: ["src/extension.ts"],
  convention: { kind: "conventional" },
};

test("sends an OpenAI Responses request and extracts its output text", async () => {
  const client = new RecordingHttpClient({
    status: 200,
    body: JSON.stringify({
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "feat: add commit command" }],
        },
      ],
    }),
  });
  const model = createLanguageModel(
    { provider: "openai", model: "gpt-test", apiKey: "test-key" },
    client,
  );

  const subject = await model.generateSubject(context);

  assert.strictEqual(subject, "feat: add commit command");
  assert.ok(client.request);
  assert.strictEqual(client.request.url, "https://api.openai.com/v1/responses");
  assert.strictEqual(client.request.headers.Authorization, "Bearer test-key");
  assert.match(client.request.body, /"model":"gpt-test"/);
});

test("sends an Anthropic Messages request and extracts its text block", async () => {
  const client = new RecordingHttpClient({
    status: 200,
    body: JSON.stringify({
      content: [{ type: "text", text: "fix: preserve staged changes" }],
    }),
  });
  const model = createLanguageModel(
    { provider: "anthropic", model: "claude-test", apiKey: "test-key" },
    client,
  );

  const subject = await model.generateSubject(context);

  assert.strictEqual(subject, "fix: preserve staged changes");
  assert.ok(client.request);
  assert.strictEqual(
    client.request.url,
    "https://api.anthropic.com/v1/messages",
  );
  assert.strictEqual(client.request.headers["x-api-key"], "test-key");
  assert.strictEqual(client.request.headers["anthropic-version"], "2023-06-01");
  assert.match(client.request.body, /"model":"claude-test"/);
});

test("sends a Gemini generateContent request and extracts candidate text", async () => {
  const client = new RecordingHttpClient({
    status: 200,
    body: JSON.stringify({
      candidates: [
        { content: { parts: [{ text: "chore: update extension config" }] } },
      ],
    }),
  });
  const model = createLanguageModel(
    { provider: "gemini", model: "gemini-test", apiKey: "test-key" },
    client,
  );

  const subject = await model.generateSubject(context);

  assert.strictEqual(subject, "chore: update extension config");
  assert.ok(client.request);
  assert.strictEqual(
    client.request.url,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent",
  );
  assert.strictEqual(client.request.headers["x-goog-api-key"], "test-key");
});

test("rejects a split proposal that contains a path absent from Git status", async () => {
  const client = new RecordingHttpClient({
    status: 200,
    body: JSON.stringify({
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                groups: [
                  {
                    subject: "feat: add extension command",
                    paths: ["src/unknown.ts"],
                  },
                ],
              }),
            },
          ],
        },
      ],
    }),
  });
  const model = createLanguageModel(
    { provider: "openai", model: "gpt-test", apiKey: "test-key" },
    client,
  );

  await assert.rejects(
    model.proposeGroups(context),
    /not present in the Git snapshot/,
  );
});
