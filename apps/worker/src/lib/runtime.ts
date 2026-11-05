import { getBoss } from "@storyflow/db/queue";
import { getEnv } from "@storyflow/shared/env";

export function log(msg: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), msg, ...fields }));
}

/** Starts pg-boss, registers handlers, and shuts down gracefully on SIGTERM/SIGINT. */
export async function runWorker(name: string, register: () => Promise<void>) {
  getEnv(); // fail fast on bad config
  const boss = await getBoss();
  await register();
  log("worker started", { worker: name });

  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log("worker stopping", { worker: name, signal });
    await boss.stop({ graceful: true, timeout: 30_000 });
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
