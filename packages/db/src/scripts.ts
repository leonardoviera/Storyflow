import type { StoryScript } from "@storyflow/shared/schemas";
import { getPrisma } from "./client";
import type { ScriptSource } from "./generated/enums";
import type { Prisma } from "./generated/client";

/** Creates the next ScriptVersion (version = max + 1) and its Scenes in one transaction. */
export async function createScriptVersion(opts: {
  projectId: string;
  script: StoryScript;
  source: ScriptSource;
  model?: string;
  sourcePrompt?: string;
}) {
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const last = await tx.scriptVersion.aggregate({ where: { projectId: opts.projectId }, _max: { version: true } });
    const version = (last._max.version ?? 0) + 1;
    return tx.scriptVersion.create({
      data: {
        projectId: opts.projectId,
        version,
        source: opts.source,
        model: opts.model,
        sourcePrompt: opts.sourcePrompt,
        content: opts.script as unknown as Prisma.InputJsonValue,
        scenes: {
          create: opts.script.scenes.map((scene, order) => ({
            order,
            title: scene.title,
            narration: scene.narration,
            visualPrompt: scene.visualPrompt,
            durationInFrames: Math.max(1, Math.round(scene.durationSeconds * opts.script.fps)),
            asset3d: (scene.asset3d ?? undefined) as Prisma.InputJsonValue | undefined,
          })),
        },
      },
      include: { scenes: { orderBy: { order: "asc" } } },
    });
  });
}
