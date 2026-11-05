import OpenAI from "openai";
import { getEnv } from "../env";

// The ONLY file allowed to import `openai` (eslint no-restricted-imports). It talks exclusively
// to the local LiteLLM proxy — never to a provider (constitution I).

export type LocalModel = "local-llm";

let client: OpenAI | undefined;

export function llm(): OpenAI {
  const env = getEnv();
  client ??= new OpenAI({ baseURL: env.LITELLM_BASE_URL, apiKey: env.LITELLM_API_KEY, maxRetries: 1, timeout: 600_000 });
  return client;
}
