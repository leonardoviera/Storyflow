import { z } from "zod";
import { getPrisma, type Prisma } from "@storyflow/db";
import { projectAssets } from "@storyflow/db/assets";
import { buildCanonicalProps, mediaTypeOf } from "@storyflow/shared/props";
import { ClipProps, TrackKind } from "@storyflow/shared/schemas";
import { computeDurationInFrames, MAX_CLIPS_PER_TRACK, MAX_TRACKS, validateTimeline } from "@storyflow/shared/timeline";
import { resolveProps } from "@storyflow/storage";
import { ConflictError, ValidationError } from "./errors";
import { getProject } from "./projects";

export const TimelineWrite = z.object({
  baseRevision: z.number().int().min(0),
  tracks: z
    .array(
      z.object({
        id: z.string().optional(),
        kind: TrackKind,
        order: z.number().int(),
        muted: z.boolean().default(false),
        locked: z.boolean().default(false),
        clips: z
          .array(
            z.object({
              id: z.string().optional(),
              sceneId: z.string().nullable().optional(),
              assetId: z.string().nullable().default(null),
              startFrame: z.number().int().min(0),
              durationInFrames: z.number().int().min(1),
              trimStartFrame: z.number().int().min(0).default(0),
              props: ClipProps.default({}),
            }),
          )
          .max(MAX_CLIPS_PER_TRACK),
      }),
    )
    .max(MAX_TRACKS),
});
export type TimelineWrite = z.infer<typeof TimelineWrite>;

async function loadTracks(projectId: string) {
  return getPrisma().track.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
    include: { clips: { orderBy: { startFrame: "asc" } } },
  });
}


/** Canonical props (asset ids only) for a project — used by preview and render. */
export async function canonicalPropsFor(projectId: string) {
  const project = await getProject(projectId);
  const [tracks, assets] = await Promise.all([loadTracks(projectId), projectAssets(projectId)]);
  const media = Object.fromEntries(assets.map((a) => [a.id, mediaTypeOf(a.mimeType)]));
  const canonical = buildCanonicalProps(project, tracks, media);
  return { project, tracks, assets, canonical };
}

export async function getTimeline(projectId: string) {
  const { project, tracks, assets, canonical } = await canonicalPropsFor(projectId);
  // Preview tolerates not-yet-READY assets by leaving their clips out of the preview props.
  const ready = new Set(assets.filter((a) => a.status === "READY").map((a) => a.id));
  const previewable = {
    ...canonical,
    tracks: canonical.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => !c.assetId || ready.has(c.assetId)) })),
  };
  const previewProps = await resolveProps(previewable, assets, "public");
  return {
    revision: project.timelineRevision,
    durationInFrames: project.durationInFrames,
    tracks,
    previewProps,
  };
}

export async function putTimeline(projectId: string, input: TimelineWrite) {
  const prisma = getPrisma();
  await getProject(projectId);
  const assets = await projectAssets(projectId);
  const kinds = Object.fromEntries(assets.map((a) => [a.id, a.kind]));
  const issues = validateTimeline(input.tracks, kinds);
  if (issues.length) throw new ValidationError("Timeline is invalid", issues);

  const durationInFrames = computeDurationInFrames(input.tracks);
  await prisma.$transaction(async (tx) => {
    // Optimistic lock: the conditional update only matches the expected revision.
    const { count } = await tx.project.updateMany({
      where: { id: projectId, timelineRevision: input.baseRevision },
      data: { timelineRevision: { increment: 1 }, durationInFrames },
    });
    if (count === 0) throw new ConflictError("Timeline was changed elsewhere (stale baseRevision)");

    await tx.track.deleteMany({ where: { projectId } });
    for (const track of input.tracks) {
      await tx.track.create({
        data: {
          projectId,
          kind: track.kind,
          order: track.order,
          muted: track.muted,
          locked: track.locked,
          clips: {
            create: track.clips.map((clip) => ({
              sceneId: clip.sceneId ?? null,
              assetId: clip.assetId,
              startFrame: clip.startFrame,
              durationInFrames: clip.durationInFrames,
              trimStartFrame: clip.trimStartFrame,
              props: clip.props as Prisma.InputJsonValue,
            })),
          },
        },
      });
    }
  });
  return getTimeline(projectId);
}
