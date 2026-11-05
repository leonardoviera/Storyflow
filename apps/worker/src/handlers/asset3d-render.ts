import { getPrisma } from "@storyflow/db";
import { failOrRetry, markRunning, succeed } from "@storyflow/db/jobs";
import { QUEUE_OPTIONS, type QueuePayload } from "@storyflow/shared/queue";
import type { WorkContext } from "@storyflow/db/queue";
import { headObject, sha256Object } from "@storyflow/storage";
import { callBlenderTool } from "../lib/mcp";
import { errorMessage, log } from "../lib/runtime";

export async function handleAsset3dRender(payload: QueuePayload<"asset3d.render">, ctx: WorkContext) {
  const prisma = getPrisma();
  const { jobId, projectId, assetId } = payload;
  try {
    await markRunning(jobId);
    const result = await callBlenderTool(payload.tool, payload.params, { projectId, outputId: assetId });
    const out = result.outputs[0];
    if (!out) throw new Error("Blender tool returned no outputs");

    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } });
    const head = await headObject(asset.bucket, out.objectKey);
    if (!head) throw new Error(`Output ${out.objectKey} missing in MinIO`);
    const sha256 = await sha256Object(asset.bucket, out.objectKey);
    if (sha256 !== out.sha256) throw new Error(`sha256 mismatch for ${out.objectKey}`);

    await prisma.asset.update({
      where: { id: assetId },
      data: {
        kind: out.mimeType === "model/gltf-binary" ? "MODEL_3D" : "RENDER_3D",
        status: "READY",
        objectKey: out.objectKey,
        mimeType: out.mimeType,
        sha256,
        sizeBytes: BigInt(out.sizeBytes),
        width: out.width,
        height: out.height,
        metadata: { ...(asset.metadata as object), frames: out.frames, blenderVersion: result.blenderVersion },
        sourceJobId: jobId,
      },
    });
    await succeed(jobId, { assetId, objectKey: out.objectKey, renderMs: result.renderMs });
    log("asset3d done", { jobId, assetId, renderMs: result.renderMs });
  } catch (err) {
    log("asset3d failed", { jobId, assetId, error: errorMessage(err) });
    if (ctx.retryCount >= QUEUE_OPTIONS["asset3d.render"].retryLimit) {
      await prisma.asset.update({ where: { id: assetId }, data: { status: "FAILED" } }).catch(() => undefined);
    }
    await failOrRetry(jobId, `3D render failed: ${errorMessage(err)}`, ctx.retryCount, QUEUE_OPTIONS["asset3d.render"].retryLimit).catch(() => undefined);
    throw err;
  }
}
