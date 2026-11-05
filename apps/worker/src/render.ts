import { work } from "@storyflow/db/queue";
import { QUEUES } from "@storyflow/shared/queue";
import { handleVideoRender } from "./handlers/video-render";
import { runWorker } from "./lib/runtime";

// render-worker: one render at a time (constitution III — localConcurrency 1, ≤ 4 threads).
await runWorker("render", async () => {
  await work(QUEUES.videoRender, { localConcurrency: 1 }, handleVideoRender);
});
