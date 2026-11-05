import { z } from "zod";

// Constitution I: every outbound URL must stay on this machine.
const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "host.docker.internal",
  "postgres",
  "minio",
  "litellm",
  "blender-mcp",
  "web",
]);

const localUrl = z.string().refine(
  (value) => {
    try {
      return LOCAL_HOSTS.has(new URL(value).hostname);
    } catch {
      return false;
    }
  },
  { message: "must point to a local host (constitution I: no cloud endpoints)" },
);

const EnvSchema = z.object({
  DATABASE_URL: localUrl,
  S3_ENDPOINT: localUrl,
  S3_PUBLIC_ENDPOINT: localUrl.optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET_ASSETS: z.string().min(3),
  S3_BUCKET_RENDERS: z.string().min(3),
  LITELLM_BASE_URL: localUrl,
  LITELLM_API_KEY: z.string().min(1),
  LITELLM_MODEL: z.literal("local-llm").default("local-llm"),
  RENDER_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(4),
  REMOTION_SERVE_URL: z.string().optional(),
  BLENDER_MCP_DIRECT_URL: localUrl.optional(),
  MCP_ROUTE: z.enum(["litellm", "direct"]).default("litellm"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Parses process.env once; throws listing every missing/invalid variable. */
export function getEnv(): Env {
  if (cached) return cached;
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join("\n")}`);
  }
  cached = result.data;
  return cached;
}
