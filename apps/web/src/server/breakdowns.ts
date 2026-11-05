import { getPrisma, type Prisma } from "@storyflow/db";
import { nextBreakdownVersion } from "@storyflow/db/breakdowns";
import { attachQueueJob, createJob } from "@storyflow/db/jobs";
import { enqueue } from "@storyflow/db/queue";
import { BreakdownDocument, checkBreakdown, FPS, parseScript, SourceLine, type ScriptSettings } from "@storyflow/shared/breakdown";
import { QUEUES } from "@storyflow/shared/queue";
import { z } from "zod";
import { ApiError, ConflictError, NotFoundError } from "./errors";
import { getProject } from "./projects";
import { getScript } from "./script";

// Breakdown versions (FR-012). Each start creates a new numbered version and a breakdown.run job;
// the worker fills the document (R7). Flags are computed on read with the shared validator.

function emptyDocument(settings: ScriptSettings): BreakdownDocument {
  return {
    schemaVersion: 1,
    fps: FPS,
    aspectRatio: settings.aspectRatio,
    synopsis: { storyType: "", audience: "", setting: "", summary: "", characterProfiles: [] },
    assets: [],
    episodes: [],
  };
}

async function activeBreakdownJob(projectId: string) {
  return getPrisma().job.findFirst({ where: { projectId, type: "BREAKDOWN", status: { in: ["QUEUED", "RUNNING"] } } });
}

async function enqueueRun(
  projectId: string,
  breakdownId: string,
  run: { mode: "full" } | { mode: "episodes"; episodeIds: string[] },
) {
  const prisma = getPrisma();
  const job = await createJob(projectId, "BREAKDOWN", { breakdownId, ...run } as Prisma.InputJsonValue);
  const queueJobId = await enqueue(QUEUES.breakdownRun, { jobId: job.id, projectId, breakdownId, ...run });
  if (!queueJobId) {
    await prisma.job.delete({ where: { id: job.id } });
    throw new ConflictError("A breakdown is already running for this version");
  }
  await attachQueueJob(job.id, queueJobId);
  await prisma.breakdown.update({ where: { id: breakdownId }, data: { jobId: job.id } });
  return job;
}

export async function startBreakdown(projectId: string) {
  const script = await getScript(projectId);
  if (!script.text.trim()) throw new ApiError(422, "EMPTY_SCRIPT", "Write or upload a script before starting a breakdown");
  if (await activeBreakdownJob(projectId)) throw new ConflictError("A breakdown is already running for this project");

  const settings: ScriptSettings = {
    aspectRatio: script.aspectRatio,
    episodeSeconds: script.episodeSeconds,
    episodeCount: script.episodeCount,
  };
  const prisma = getPrisma();
  const breakdown = await prisma.breakdown.create({
    data: {
      projectId,
      version: await nextBreakdownVersion(projectId),
      status: "RUNNING",
      sourceText: script.text,
      sourceLines: parseScript(script.text) as Prisma.InputJsonValue,
      settings: { ...settings, fps: FPS },
      document: emptyDocument(settings) as Prisma.InputJsonValue,
    },
  });
  await prisma.project.update({ where: { id: projectId }, data: { currentBreakdownId: breakdown.id } });
  const job = await enqueueRun(projectId, breakdown.id, { mode: "full" });
  return { jobId: job.id, version: breakdown.version };
}

export async function listBreakdowns(projectId: string) {
  const project = await getProject(projectId);
  const rows = await getPrisma().breakdown.findMany({
    where: { projectId },
    orderBy: { version: "desc" },
    select: { id: true, version: true, status: true, createdAt: true },
  });
  return rows.map(({ id, ...row }) => ({ ...row, isCurrent: id === project.currentBreakdownId }));
}

async function findBreakdown(projectId: string, version: number) {
  const breakdown = await getPrisma().breakdown.findUnique({ where: { projectId_version: { projectId, version } } });
  if (!breakdown) throw new NotFoundError(`Breakdown version ${version}`);
  return breakdown;
}

export async function getBreakdown(projectId: string, version: number) {
  const project = await getProject(projectId);
  const b = await findBreakdown(projectId, version);
  const sourceLines = z.array(SourceLine).parse(b.sourceLines);
  const { flags } = checkBreakdown(b.document, sourceLines);
  return {
    version: b.version,
    status: b.status,
    isCurrent: b.id === project.currentBreakdownId,
    createdAt: b.createdAt,
    revision: b.revision,
    jobId: b.jobId,
    settings: b.settings,
    document: b.document,
    flags,
  };
}

export async function retryEpisode(projectId: string, version: number, episodeId: string) {
  await getProject(projectId);
  const b = await findBreakdown(projectId, version);
  if (await activeBreakdownJob(projectId)) throw new ConflictError("A breakdown is already running for this project");
  const episode = BreakdownDocument.parse(b.document).episodes.find((e) => e.id === episodeId);
  if (!episode) throw new NotFoundError(`Episode ${episodeId}`);
  if (episode.status !== "failed" && episode.status !== "pending") {
    throw new ConflictError(`Episode ${episode.order} is ${episode.status}; only failed or pending episodes can be retried`);
  }
  const job = await enqueueRun(projectId, b.id, { mode: "episodes", episodeIds: [episodeId] });
  return { jobId: job.id };
}
