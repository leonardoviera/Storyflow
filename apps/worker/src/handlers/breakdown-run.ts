import type { QueuePayload } from "@storyflow/shared/queue";
import type { WorkContext } from "@storyflow/db/queue";

// Implemented in T022 (US1).
export async function handleBreakdownRun(_payload: QueuePayload<"breakdown.run">, _ctx: WorkContext) {
  throw new Error("breakdown.run is not implemented yet");
}
