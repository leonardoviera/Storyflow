import { getEnv } from "@storyflow/shared/env";
import { QUEUES } from "@storyflow/shared/queue";
import { Blender3dToolParams } from "@storyflow/shared/schemas";
import { getPrisma } from "./client";
import { attachQueueJob, createJob } from "./jobs";
import { enqueue } from "./queue";
import type { Prisma } from "./generated/client";

/**
 * Validates tool params (throws ZodError), creates a PENDING RENDER_3D asset + ASSET_3D job and
 * enqueues `asset3d.render`. Shared by the web route and the script pipeline.
 */
export async function enqueueAsset3d(opts: { projectId: string; tool: string; params: unknown; sceneId?: string }) {
  const parsed = Blender3dToolParams.parse({ tool: opts.tool, params: opts.params });
  const prisma = getPrisma();
  const asset = await prisma.asset.create({
    data: {
      projectId: opts.projectId,
      kind: "RENDER_3D",
      status: "PENDING",
      source: "BLENDER",
      bucket: getEnv().S3_BUCKET_ASSETS,
      objectKey: `pending/${crypto.randomUUID()}`,
      mimeType: "application/octet-stream",
      metadata: { tool: parsed.tool, sceneId: opts.sceneId ?? null },
    },
  });
  const payload = {
    projectId: opts.projectId,
    sceneId: opts.sceneId,
    assetId: asset.id,
    tool: parsed.tool,
    params: parsed.params as Record<string, unknown>,
  };
  const job = await createJob(opts.projectId, "ASSET_3D", payload as Prisma.InputJsonValue);
  await prisma.asset.update({ where: { id: asset.id }, data: { sourceJobId: job.id } });
  const queueJobId = await enqueue(QUEUES.asset3dRender, { jobId: job.id, ...payload });
  if (queueJobId) await attachQueueJob(job.id, queueJobId);
  return { job, asset };
}
