import { enqueueAsset3d } from "@storyflow/db/asset3d";
import { failOrRetry, markRunning, succeed } from "@storyflow/db/jobs";
import { createScriptVersion } from "@storyflow/db/scripts";
import { generateStoryScript } from "@storyflow/shared/llm";
import { QUEUE_OPTIONS, type QueuePayload } from "@storyflow/shared/queue";
import type { WorkContext } from "@storyflow/db/queue";
import { errorMessage, log } from "../lib/runtime";

export async function handleScriptGenerate(payload: QueuePayload<"script.generate">, ctx: WorkContext) {
  const { jobId, projectId } = payload;
  try {
    await markRunning(jobId);
    const { script, droppedAsset3d } = await generateStoryScript({
      prompt: payload.prompt,
      model: payload.model,
      targetDurationSeconds: payload.targetDurationSeconds,
    });
    if (droppedAsset3d) log("dropped invalid asset3d specs", { jobId, droppedAsset3d });

    const version = await createScriptVersion({
      projectId,
      script,
      source: "LLM",
      model: payload.model,
      sourcePrompt: payload.prompt,
    });

    // Waits in the queue until a Blender consumer exists (US4).
    const asset3dJobIds: string[] = [];
    if (payload.autoRender3d) {
      for (const scene of version.scenes) {
        const spec = scene.asset3d as { tool: string; params: unknown } | null;
        if (!spec) continue;
        try {
          const { job } = await enqueueAsset3d({ projectId, tool: spec.tool, params: spec.params, sceneId: scene.id });
          asset3dJobIds.push(job.id);
        } catch (err) {
          log("skipped asset3d", { jobId, sceneId: scene.id, error: errorMessage(err) });
        }
      }
    }

    await succeed(jobId, { scriptVersionId: version.id, version: version.version, sceneCount: version.scenes.length, asset3dJobIds });
    log("script generated", { jobId, version: version.version, scenes: version.scenes.length });
  } catch (err) {
    log("script generation failed", { jobId, error: errorMessage(err) });
    await failOrRetry(jobId, `Script generation failed: ${errorMessage(err)}`, ctx.retryCount, QUEUE_OPTIONS["script.generate"].retryLimit).catch(() => undefined);
    throw err;
  }
}
