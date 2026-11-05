import { z } from "zod";
import { getPrisma, type Prisma } from "@storyflow/db";
import { attachQueueJob, createJob } from "@storyflow/db/jobs";
import { enqueue } from "@storyflow/db/queue";
import { createScriptVersion } from "@storyflow/db/scripts";
import { QUEUES } from "@storyflow/shared/queue";
import { StoryScript, type ClipProps } from "@storyflow/shared/schemas";
import { ConflictError, NotFoundError } from "./errors";
import { getProject } from "./projects";
import { getTimeline } from "./timeline";

export const GenerateRequest = z.object({
  prompt: z.string().trim().min(1).max(4000),
  model: z.literal("local-llm").default("local-llm"),
  targetDurationSeconds: z.number().int().min(5).max(300).optional(),
  autoRender3d: z.boolean().default(true),
});

export async function enqueueGenerate(projectId: string, input: z.infer<typeof GenerateRequest>) {
  await getProject(projectId);
  const prisma = getPrisma();
  const active = await prisma.job.findFirst({
    where: { projectId, type: "SCRIPT_GENERATION", status: { in: ["QUEUED", "RUNNING"] } },
  });
  if (active) throw new ConflictError("A script job is already active for this project");

  const job = await createJob(projectId, "SCRIPT_GENERATION", input as Prisma.InputJsonValue);
  const queueJobId = await enqueue(QUEUES.scriptGenerate, { jobId: job.id, projectId, ...input });
  if (!queueJobId) {
    await prisma.job.delete({ where: { id: job.id } });
    throw new ConflictError("A script job is already active for this project");
  }
  await attachQueueJob(job.id, queueJobId);
  await prisma.project.update({ where: { id: projectId }, data: { prompt: input.prompt } });
  return prisma.job.findUniqueOrThrow({ where: { id: job.id } });
}

export async function listScripts(projectId: string) {
  await getProject(projectId);
  return getPrisma().scriptVersion.findMany({
    where: { projectId },
    orderBy: { version: "desc" },
    include: { scenes: { orderBy: { order: "asc" } } },
  });
}

export async function saveManualScript(projectId: string, content: unknown) {
  await getProject(projectId);
  return createScriptVersion({ projectId, script: StoryScript.parse(content), source: "MANUAL" });
}

const TRANSITION_FRAMES = 12;

/** Makes the version current and rebuilds the timeline from its scenes (one transaction). */
export async function applyScript(projectId: string, version: number) {
  const prisma = getPrisma();
  await getProject(projectId);
  const script = await prisma.scriptVersion.findUnique({
    where: { projectId_version: { projectId, version } },
    include: { scenes: { orderBy: { order: "asc" } } },
  });
  if (!script) throw new NotFoundError(`Script version ${version}`);
  const content = StoryScript.parse(script.content);

  // READY 3D renders produced for these scenes (Asset.metadata.sceneId).
  const renders3d = await prisma.asset.findMany({ where: { projectId, kind: "RENDER_3D", status: "READY" } });
  const renderForScene = new Map<string, string>();
  for (const asset of renders3d) {
    const sceneId = (asset.metadata as { sceneId?: string } | null)?.sceneId;
    if (sceneId) renderForScene.set(sceneId, asset.id);
  }

  let cursor = 0;
  const textClips: Prisma.ClipCreateWithoutTrackInput[] = [];
  const overlayClips: Prisma.ClipCreateWithoutTrackInput[] = [];
  script.scenes.forEach((scene, i) => {
    const spec = content.scenes[i];
    const transition = spec?.transition && spec.transition !== "cut" ? spec.transition : null;
    const props: ClipProps = {
      text: (spec?.onScreenText ?? scene.title).slice(0, 200),
      ...(transition
        ? {
            transitionIn: { type: transition, durationInFrames: Math.min(TRANSITION_FRAMES, scene.durationInFrames) },
          }
        : {}),
    };
    textClips.push({
      scene: { connect: { id: scene.id } },
      startFrame: cursor,
      durationInFrames: scene.durationInFrames,
      props: props as Prisma.InputJsonValue,
    });
    const assetId = renderForScene.get(scene.id);
    if (assetId) {
      overlayClips.push({
        scene: { connect: { id: scene.id } },
        asset: { connect: { id: assetId } },
        startFrame: cursor,
        durationInFrames: scene.durationInFrames,
        props: { fit: "contain" } as Prisma.InputJsonValue,
      });
    }
    cursor += scene.durationInFrames;
  });

  await prisma.$transaction(async (tx) => {
    await tx.track.deleteMany({ where: { projectId } });
    await tx.track.create({ data: { projectId, kind: "TEXT", order: 0, clips: { create: textClips } } });
    if (overlayClips.length) {
      await tx.track.create({ data: { projectId, kind: "OVERLAY_3D", order: 1, clips: { create: overlayClips } } });
    }
    await tx.project.update({
      where: { id: projectId },
      data: {
        currentScriptVersionId: script.id,
        fps: content.fps,
        durationInFrames: Math.max(1, cursor),
        timelineRevision: { increment: 1 },
        title: content.title,
      },
    });
  });
  return getTimeline(projectId);
}
