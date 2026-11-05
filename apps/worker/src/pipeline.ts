import { work } from "@storyflow/db/queue";
import { QUEUES } from "@storyflow/shared/queue";
import { handleAsset3dRender } from "./handlers/asset3d-render";
import { handleScriptGenerate } from "./handlers/script-generate";
import { runWorker } from "./lib/runtime";

// pipeline-worker: LLM script generation + Blender MCP 3D assets.
await runWorker("pipeline", async () => {
  await work(QUEUES.scriptGenerate, { localConcurrency: 1 }, handleScriptGenerate);
  await work(QUEUES.asset3dRender, { localConcurrency: 1 }, handleAsset3dRender);
});
