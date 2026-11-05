import { getPrisma } from "@storyflow/db";
import { cancel } from "@storyflow/db/jobs";
import { cancelQueueJob } from "@storyflow/db/queue";
import { QUEUES, type QueueName } from "@storyflow/shared/queue";
import { ConflictError, NotFoundError } from "./errors";

const QUEUE_FOR: Record<string, QueueName> = {
  SCRIPT_GENERATION: QUEUES.scriptGenerate,
  ASSET_3D: QUEUES.asset3dRender,
  VIDEO_RENDER: QUEUES.videoRender,
};

export async function getJob(id: string) {
  const job = await getPrisma().job.findUnique({ where: { id } });
  if (!job) throw new NotFoundError("Job");
  return job;
}

export async function cancelJob(id: string) {
  const job = await getJob(id);
  if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job.status)) {
    throw new ConflictError(`Job is already ${job.status}`);
  }
  if (job.queueJobId) await cancelQueueJob(QUEUE_FOR[job.type]!, job.queueJobId).catch(() => undefined);
  await cancel(id); // running render workers poll this and abort via cancelSignal
  return getJob(id);
}
