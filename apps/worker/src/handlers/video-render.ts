import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeCancelSignal } from "@remotion/renderer";
import { getPrisma } from "@storyflow/db";
import { failOrRetry, isCancelled, JobCancelled, markRunning, reportProgress, succeed } from "@storyflow/db/jobs";
import { QUEUE_OPTIONS, type QueuePayload } from "@storyflow/shared/queue";
import type { WorkContext } from "@storyflow/db/queue";
import { StoryCompositionProps } from "@storyflow/shared/schemas";
import { getEnv } from "@storyflow/shared/env";
import { assetObjectKey, resolveProps, uploadFile } from "@storyflow/storage";
import { renderVideo } from "../lib/renderer";
import { errorMessage, log } from "../lib/runtime";

export async function handleVideoRender(payload: QueuePayload<"video.render">, ctx: WorkContext) {
  const prisma = getPrisma();
  const env = getEnv();
  const { jobId, renderId, projectId } = payload;
  const outPath = join(tmpdir(), `${renderId}.mp4`);
  const { cancelSignal, cancel } = makeCancelSignal();
  const poll = setInterval(() => {
    isCancelled(jobId)
      .then((c) => c && cancel())
      .catch(() => undefined);
  }, 2000);

  try {
    await markRunning(jobId);
    const render = await prisma.render.findUniqueOrThrow({ where: { id: renderId } });
    const canonical = StoryCompositionProps.parse(render.inputProps);
    const assets = await prisma.asset.findMany({ where: { projectId } });
    const resolved = await resolveProps(canonical, assets, "internal");

    const started = Date.now();
    log("render start", { jobId, renderId, frames: canonical.durationInFrames });
    await renderVideo({
      compositionId: render.compositionId,
      inputProps: resolved,
      outPath,
      cancelSignal,
      onProgress: (p) => void reportProgress(jobId, p * 0.95).catch(() => undefined),
    });
    const renderMs = Date.now() - started;

    const asset = await prisma.asset.create({
      data: {
        projectId,
        kind: "FINAL_RENDER",
        status: "PENDING",
        source: "RENDER",
        bucket: env.S3_BUCKET_RENDERS,
        objectKey: `pending/${renderId}`,
        mimeType: "video/mp4",
        width: canonical.width,
        height: canonical.height,
        durationMs: Math.round((canonical.durationInFrames / canonical.fps) * 1000),
        sourceJobId: jobId,
      },
    });
    const objectKey = assetObjectKey(projectId, "FINAL_RENDER", asset.id, "mp4");
    const { sha256, sizeBytes } = await uploadFile(env.S3_BUCKET_RENDERS, objectKey, outPath, "video/mp4");
    await prisma.asset.update({
      where: { id: asset.id },
      data: { objectKey, sha256, sizeBytes: BigInt(sizeBytes), status: "READY" },
    });
    await prisma.render.update({ where: { id: renderId }, data: { outputAssetId: asset.id, renderMs } });
    await succeed(jobId, { renderId, assetId: asset.id, renderMs });
    log("render done", { jobId, renderId, renderMs, sizeBytes });
  } catch (err) {
    if (err instanceof JobCancelled || (await isCancelled(jobId))) {
      log("render cancelled", { jobId, renderId });
      return;
    }
    log("render failed", { jobId, renderId, error: errorMessage(err) });
    await failOrRetry(jobId, `Render failed: ${errorMessage(err)}`, ctx.retryCount, QUEUE_OPTIONS["video.render"].retryLimit).catch(() => undefined);
    throw err; // let pg-boss apply its retry policy
  } finally {
    clearInterval(poll);
    await rm(outPath, { force: true });
  }
}
