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

/** True when LiteLLM (or the model server behind it) could not be reached or failed with 5xx. */
export function isLlmUnavailable(err: unknown): boolean {
  if (err instanceof OpenAI.APIConnectionError) return true; // includes APIConnectionTimeoutError
  if (err instanceof OpenAI.APIError && typeof err.status === "number" && err.status >= 500) return true;
  const code = (err as { code?: string; cause?: { code?: string } } | null)?.cause?.code ?? (err as { code?: string } | null)?.code;
  return code === "ECONNREFUSED" || code === "ECONNRESET" || code === "ENOTFOUND";
}
