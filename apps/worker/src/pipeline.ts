import { work } from "@storyflow/db/queue";
import { QUEUES } from "@storyflow/shared/queue";
import { handleAsset3dRender } from "./handlers/asset3d-render";
import { handleBreakdownRun } from "./handlers/breakdown-run";
import { handleScriptGenerate } from "./handlers/script-generate";
import { handleScriptWrite } from "./handlers/script-write";
import { runWorker } from "./lib/runtime";

// pipeline-worker: LLM script generation, script writing and breakdowns + Blender MCP 3D assets.
// Single replica: withLlmSlot() serializes LLM calls only within this process (R7).
await runWorker("pipeline", async () => {
  await work(QUEUES.scriptGenerate, { localConcurrency: 1 }, handleScriptGenerate);
  await work(QUEUES.asset3dRender, { localConcurrency: 1 }, handleAsset3dRender);
  await work(QUEUES.scriptWrite, { localConcurrency: 1 }, handleScriptWrite);
  await work(QUEUES.breakdownRun, { localConcurrency: 1 }, handleBreakdownRun);
});
