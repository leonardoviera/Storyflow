import { getPrisma } from "@storyflow/db";
import { getEnv } from "@storyflow/shared/env";
import { assertBucketsReachable } from "@storyflow/storage";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";

async function check(fn: () => Promise<unknown>): Promise<"ok" | "down"> {
  try {
    await Promise.race([fn(), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000))]);
    return "ok";
  } catch {
    return "down";
  }
}

export async function GET() {
  const env = getEnv();
  const auth = { Authorization: `Bearer ${env.LITELLM_API_KEY}` };
  const [postgres, minio, litellm, blenderMcp] = await Promise.all([
    check(() => getPrisma().$queryRaw`SELECT 1`),
    check(() => assertBucketsReachable([env.S3_BUCKET_ASSETS, env.S3_BUCKET_RENDERS])),
    check(async () => {
      const res = await fetch(new URL("/health/liveliness", env.LITELLM_BASE_URL), { headers: auth });
      if (!res.ok) throw new Error(String(res.status));
    }),
    check(async () => {
      // Via LiteLLM's MCP registry first; fall back to the server's own health endpoint.
      const viaLitellm = await fetch(new URL("/v1/mcp/server/health", env.LITELLM_BASE_URL), { headers: auth })
        .then((r) => r.ok)
        .catch(() => false);
      if (viaLitellm) return;
      if (!env.BLENDER_MCP_DIRECT_URL) throw new Error("no route");
      const res = await fetch(new URL("/healthz", env.BLENDER_MCP_DIRECT_URL));
      if (!res.ok) throw new Error(String(res.status));
    }),
  ]);
  const checks = { postgres, minio, litellm, blenderMcp };
  const ok = Object.values(checks).every((v) => v === "ok");
  return json({ status: ok ? "ok" : "degraded", checks }, ok ? 200 : 503);
}
