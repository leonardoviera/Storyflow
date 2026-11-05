import { z } from "zod";
import { getPrisma, type Prisma } from "@storyflow/db";
import { StoryCompositionProps } from "@storyflow/shared/schemas";
import { NotFoundError } from "./errors";

const even = (n: number) => n % 2 === 0;
// "width, height 16–7680, both even (H.264 requirement)"
const Dimension = z.number().int().min(16).max(7680).refine(even, "must be even (H.264 requirement)");
// "fps one of 24, 25, 30, 60"
const Fps = z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]);

export const ProjectCreate = z.object({
  title: z.string().trim().min(1).max(120), // "title 1–120 chars"
  prompt: z.string().max(4000).optional(), // "prompt ≤ 4000 chars"
  templateSlug: z.string().optional(),
  width: Dimension.default(1920),
  height: Dimension.default(1080),
  fps: Fps.default(30),
});

export const ProjectUpdate = z
  .object({
    title: z.string().trim().min(1).max(120),
    width: Dimension,
    height: Dimension,
    fps: Fps,
  })
  .partial();

export async function listProjects() {
  return getPrisma().project.findMany({ where: { archivedAt: null }, orderBy: { updatedAt: "desc" } });
}

export async function getProject(id: string) {
  const project = await getPrisma().project.findFirst({ where: { id, archivedAt: null } });
  if (!project) throw new NotFoundError("Project");
  return project;
}

export async function createProject(input: z.infer<typeof ProjectCreate>) {
  const prisma = getPrisma();
  const template = input.templateSlug
    ? await prisma.template.findUnique({ where: { slug: input.templateSlug } })
    : null;
  if (input.templateSlug && !template) throw new NotFoundError(`Template ${input.templateSlug}`);
  const defaults = template ? StoryCompositionProps.parse(template.defaultProps) : null;

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        title: input.title,
        prompt: input.prompt,
        templateId: template?.id,
        compositionId: template?.compositionId ?? "StoryComposition",
        width: defaults?.width ?? input.width,
        height: defaults?.height ?? input.height,
        fps: defaults?.fps ?? input.fps,
        durationInFrames: defaults?.durationInFrames ?? 1,
      },
    });
    // Template clips are TEXT-only or reference shared assets; ids are regenerated per project.
    for (const track of defaults?.tracks ?? []) {
      await tx.track.create({
        data: {
          projectId: project.id,
          kind: track.kind,
          order: track.order,
          muted: track.muted,
          clips: {
            create: track.clips.map((clip) => ({
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
    return project;
  });
}

export async function updateProject(id: string, patch: z.infer<typeof ProjectUpdate>) {
  await getProject(id);
  return getPrisma().project.update({ where: { id }, data: patch });
}

export async function archiveProject(id: string) {
  await getProject(id);
  await getPrisma().project.update({ where: { id }, data: { archivedAt: new Date() } });
}
