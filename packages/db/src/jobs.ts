import { getPrisma } from "./client";
import { JobStatus, type JobType } from "./generated/enums";
import type { Prisma } from "./generated/client";

// Job state machine (data-model.md):
// QUEUED → RUNNING → SUCCEEDED | FAILED; QUEUED|RUNNING → CANCELLED; FAILED → QUEUED while attempts < 3.

export const MAX_ATTEMPTS = 3;

const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  QUEUED: ["RUNNING", "CANCELLED"],
  RUNNING: ["SUCCEEDED", "FAILED", "CANCELLED", "QUEUED"], // QUEUED: expired/retried by pg-boss
  FAILED: ["QUEUED", "RUNNING"], // retry, only while attempts < MAX_ATTEMPTS
  SUCCEEDED: [],
  CANCELLED: [],
};

export class InvalidJobTransition extends Error {
  constructor(from: JobStatus, to: JobStatus) {
    super(`Invalid job transition ${from} → ${to}`);
  }
}

export class JobCancelled extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} was cancelled`);
  }
}

async function transition(jobId: string, to: JobStatus, data: Prisma.JobUpdateInput = {}) {
  const prisma = getPrisma();
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  if (!TRANSITIONS[job.status].includes(to)) throw new InvalidJobTransition(job.status, to);
  if (job.status === JobStatus.FAILED && job.attempts >= MAX_ATTEMPTS) {
    throw new InvalidJobTransition(job.status, to);
  }
  // Conditional update guards against a concurrent cancel between read and write.
  const { count } = await prisma.job.updateMany({
    where: { id: jobId, status: job.status },
    data: { ...(data as Prisma.JobUpdateManyMutationInput), status: to },
  });
  if (count === 0) {
    const fresh = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    if (fresh.status === JobStatus.CANCELLED) throw new JobCancelled(jobId);
    throw new InvalidJobTransition(fresh.status, to);
  }
}

export async function createJob(projectId: string, type: JobType, input: Prisma.InputJsonValue) {
  return getPrisma().job.create({ data: { projectId, type, input, status: JobStatus.QUEUED } });
}

export async function attachQueueJob(jobId: string, queueJobId: string) {
  await getPrisma().job.update({ where: { id: jobId }, data: { queueJobId } });
}

export async function markRunning(jobId: string) {
  await transition(jobId, JobStatus.RUNNING, {
    startedAt: new Date(),
    attempts: { increment: 1 },
    error: null,
    progress: 0,
  });
}

const lastProgressWrite = new Map<string, number>();

/** Throttled to ≤ 1 write per second per job. */
export async function reportProgress(jobId: string, progress: number) {
  const now = Date.now();
  const last = lastProgressWrite.get(jobId) ?? 0;
  if (now - last < 1000 && progress < 1) return;
  lastProgressWrite.set(jobId, now);
  await getPrisma().job.updateMany({
    where: { id: jobId, status: JobStatus.RUNNING },
    data: { progress: Math.max(0, Math.min(1, progress)) },
  });
}

export async function succeed(jobId: string, output: Prisma.InputJsonValue) {
  lastProgressWrite.delete(jobId);
  await transition(jobId, JobStatus.SUCCEEDED, { output, progress: 1, finishedAt: new Date() });
}

export async function fail(jobId: string, message: string) {
  lastProgressWrite.delete(jobId);
  await transition(jobId, JobStatus.FAILED, { error: message.slice(0, 2000), finishedAt: new Date() });
}

export async function cancel(jobId: string) {
  lastProgressWrite.delete(jobId);
  await transition(jobId, JobStatus.CANCELLED, { finishedAt: new Date() });
}

export async function isCancelled(jobId: string): Promise<boolean> {
  const job = await getPrisma().job.findUnique({ where: { id: jobId }, select: { status: true } });
  return job?.status === JobStatus.CANCELLED;
}

/** Called when a handler throws: QUEUED ("retrying…") while pg-boss has retries left, else FAILED. */
export async function failOrRetry(jobId: string, message: string, retryCount: number, retryLimit: number) {
  lastProgressWrite.delete(jobId);
  if (retryCount < retryLimit) {
    await transition(jobId, JobStatus.QUEUED, { error: `Retrying after error: ${message}`.slice(0, 2000) });
  } else {
    await fail(jobId, message);
  }
}

const LLM_JOB_TYPES: JobType[] = ["SCRIPT_GENERATION", "SCRIPT_WRITE", "BREAKDOWN"];

/** LLM jobs waiting ahead of this one (FR-032); null when it is not a queued LLM job. */
export async function queuePositionFor(jobId: string): Promise<number | null> {
  const prisma = getPrisma();
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { type: true, status: true, createdAt: true } });
  if (!job || job.status !== JobStatus.QUEUED || !LLM_JOB_TYPES.includes(job.type)) return null;
  return prisma.job.count({
    where: {
      type: { in: LLM_JOB_TYPES },
      status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
      createdAt: { lt: job.createdAt },
    },
  });
}
