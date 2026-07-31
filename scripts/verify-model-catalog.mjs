#!/usr/bin/env node
// Checks every curated model ID in src/llm/model-catalog.ts against the
// provider's live models endpoint, so a retired ID is caught here rather than
// as a 404 the first time a user picks it.
//
// Run before an extension version bump:
//   OPENAI_API_KEY=... ANTHROPIC_API_KEY=... GEMINI_API_KEY=... pnpm run verify:models
//
// Providers without a key in the environment are reported as skipped, never
// silently treated as passing. Exits non-zero when a curated ID is missing.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const providers = {
  openai: {
    envVar: "OPENAI_API_KEY",
    url: "https://api.openai.com/v1/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    // { data: [{ id }] }
    ids: (body) => body.data.map((model) => model.id),
  },
  anthropic: {
    envVar: "ANTHROPIC_API_KEY",
    url: "https://api.anthropic.com/v1/models?limit=1000",
    headers: (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" }),
    // { data: [{ id }] }
    ids: (body) => body.data.map((model) => model.id),
  },
  gemini: {
    envVar: "GEMINI_API_KEY",
    url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
    headers: (key) => ({ "x-goog-api-key": key }),
    // { models: [{ name: "models/gemini-..." }] }
    ids: (body) =>
      body.models.map((model) => model.name.replace(/^models\//, "")),
  },
};

/** Read the curated IDs without importing TypeScript. */
async function curatedIds() {
  const source = await readFile(join(root, "src/llm/model-catalog.ts"), "utf8");
  const catalog = {};
  let provider;
  for (const line of source.split("\n")) {
    const heading = /^ {2}(openai|anthropic|gemini): \[/.exec(line);
    if (heading) {
      provider = heading[1];
      catalog[provider] = [];
      continue;
    }
    const entry = /^ {6}model: "([^"]+)"/.exec(line);
    if (entry && provider) {
      catalog[provider].push(entry[1]);
    }
  }
  return catalog;
}

async function liveIds(provider) {
  const config = providers[provider];
  const response = await fetch(config.url, {
    headers: config.headers(process.env[config.envVar]),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${await response.text()}`);
  }
  return config.ids(await response.json());
}

const catalog = await curatedIds();
let failed = false;

for (const [provider, curated] of Object.entries(catalog)) {
  if (curated.length === 0) {
    console.error(
      `${provider}: no model IDs parsed from the catalog — check the file layout`,
    );
    failed = true;
    continue;
  }
  if (!process.env[providers[provider].envVar]) {
    console.log(
      `${provider}: SKIPPED (${providers[provider].envVar} not set) — not verified`,
    );
    continue;
  }

  let available;
  try {
    available = await liveIds(provider);
  } catch (error) {
    console.error(`${provider}: could not list models — ${error.message}`);
    failed = true;
    continue;
  }

  const missing = curated.filter((id) => !available.includes(id));
  if (missing.length > 0) {
    console.error(`${provider}: MISSING ${missing.join(", ")}`);
    failed = true;
  } else {
    console.log(
      `${provider}: ok (${curated.length} verified of ${available.length} available)`,
    );
  }

  const newest = available.filter((id) => !curated.includes(id)).slice(-8);
  if (newest.length > 0) {
    console.log(
      `${provider}: other IDs on this account include ${newest.join(", ")}`,
    );
  }
}

if (failed) {
  console.error(
    "\nUpdate src/llm/model-catalog.ts and its catalogVerifiedOn date.",
  );
  process.exit(1);
}
