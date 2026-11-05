import type { QueuePayload } from "@storyflow/shared/queue";
import type { WorkContext } from "@storyflow/db/queue";

// Implemented in T037 (US2).
export async function handleScriptWrite(_payload: QueuePayload<"script.write">, _ctx: WorkContext) {
  throw new Error("script.write is not implemented yet");
}
