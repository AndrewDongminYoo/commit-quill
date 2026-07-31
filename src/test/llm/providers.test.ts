import * as assert from "node:assert";
import { test } from "mocha";

import {
  createLanguageModel,
  FetchHttpClient,
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

  const subject = await model.generateMessage(context);

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

  const subject = await model.generateMessage(context);

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

  const subject = await model.generateMessage(context);

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

test("reports the provider's failure reason alongside the status code", async () => {
  const client = new RecordingHttpClient({
    status: 404,
    body: JSON.stringify({
      type: "error",
      error: {
        type: "not_found_error",
        message: "model: claude-3-5-haiku-20241022",
      },
    }),
  });
  const model = createLanguageModel(
    { provider: "anthropic", model: "claude-3-5-haiku-20241022", apiKey: "k" },
    client,
  );

  await assert.rejects(
    model.generateMessage(context),
    /HTTP 404\. model: claude-3-5-haiku-20241022/,
  );
});

test("falls back to the raw body when it is not a provider error envelope", async () => {
  const client = new RecordingHttpClient({
    status: 502,
    body: "upstream request timeout",
  });
  const model = createLanguageModel(
    { provider: "gemini", model: "gemini-test", apiKey: "k" },
    client,
  );

  await assert.rejects(
    model.generateMessage(context),
    /HTTP 502\. upstream request timeout/,
  );
});

test("reports a cancelled request rather than a transport failure", async () => {
  const controller = new AbortController();
  controller.abort();

  // The signal is already aborted, so fetch rejects before touching the network.
  await assert.rejects(
    new FetchHttpClient(controller.signal).post({
      url: "https://example.invalid/",
      headers: {},
      body: "{}",
    }),
    (error: Error) => error.name === "LanguageModelCancelledError",
  );
});

test("keeps a body on the message but reduces split subjects to one line", async () => {
  const withBody = "feat: add commit command\n\nExplains the why.";
  const client = new RecordingHttpClient({
    status: 200,
    body: JSON.stringify({
      content: [{ type: "text", text: withBody }],
    }),
  });
  const model = createLanguageModel(
    { provider: "anthropic", model: "m", apiKey: "k" },
    client,
  );

  assert.strictEqual(await model.generateMessage(context), withBody);
});

test("reduces a multi-line split-group subject to its first line", async () => {
  const client = new RecordingHttpClient({
    status: 200,
    body: JSON.stringify({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            groups: [
              {
                subject:
                  "feat: add extension\n\nA body the -m flag cannot hold.",
                paths: ["src/extension.ts"],
              },
            ],
          }),
        },
      ],
    }),
  });
  const model = createLanguageModel(
    { provider: "anthropic", model: "m", apiKey: "k" },
    client,
  );

  const groups = await model.proposeGroups(context);

  assert.deepStrictEqual(groups, [
    { subject: "feat: add extension", paths: ["src/extension.ts"] },
  ]);
});
