import { z } from "zod";
import { getPrisma, type Prisma } from "@storyflow/db";
import { attachQueueJob, createJob } from "@storyflow/db/jobs";
import { enqueue } from "@storyflow/db/queue";
import { hashCanonicalProps } from "@storyflow/shared/props-hash";
import { referencedAssetIds } from "@storyflow/shared/props";
import { QUEUES } from "@storyflow/shared/queue";
import { AssetNotReadyError } from "@storyflow/storage";
import { ValidationError } from "./errors";
import { canonicalPropsFor } from "./timeline";

export const RenderRequest = z.object({ force: z.boolean().default(false) });

/** 200 + existing render when an identical successful one exists; otherwise 202 + new render. */
export async function createRender(projectId: string, { force }: z.infer<typeof RenderRequest>) {
  const prisma = getPrisma();
  const { project, assets, canonical } = await canonicalPropsFor(projectId);

  if (canonical.tracks.every((t) => t.clips.length === 0)) {
    throw new ValidationError("Timeline is empty", [{ path: ["tracks"], message: "add at least one clip" }]);
  }
  const byId = new Map(assets.map((a) => [a.id, a]));
  const referenced = referencedAssetIds(canonical);
  const notReady = referenced.filter((id) => byId.get(id)?.status !== "READY");
  if (notReady.length) throw new AssetNotReadyError(notReady);

  const sha = Object.fromEntries(referenced.map((id) => [id, byId.get(id)!.sha256 ?? ""]));
  const inputPropsHash = hashCanonicalProps(canonical, sha, project.compositionId);

  if (!force) {
    const existing = await prisma.render.findFirst({
      where: { projectId, inputPropsHash, outputAssetId: { not: null }, job: { status: "SUCCEEDED" } },
      include: { job: true },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return { status: 200 as const, render: existing };
  }

  const job = await createJob(projectId, "VIDEO_RENDER", { inputPropsHash, force });
  const render = await prisma.render.create({
    data: {
      projectId,
      jobId: job.id,
      compositionId: project.compositionId,
      inputProps: canonical as unknown as Prisma.InputJsonValue,
      inputPropsHash,
      codec: "h264",
    },
  });
  const queueJobId = await enqueue(QUEUES.videoRender, {
    jobId: job.id,
    projectId,
    renderId: render.id,
    compositionId: project.compositionId,
    inputPropsHash,
  });
  if (queueJobId) {
    await attachQueueJob(job.id, queueJobId);
  } else {
    // An identical render is already queued/running (singletonKey render:{hash}).
    await prisma.job.update({ where: { id: job.id }, data: { status: "CANCELLED", error: "Identical render already in progress", finishedAt: new Date() } });
  }
  return {
    status: 202 as const,
    render: await prisma.render.findUniqueOrThrow({ where: { id: render.id }, include: { job: true } }),
  };
}

export async function listRenders(projectId: string) {
  return getPrisma().render.findMany({
    where: { projectId },
    include: { job: true },
    orderBy: { createdAt: "desc" },
  });
}
