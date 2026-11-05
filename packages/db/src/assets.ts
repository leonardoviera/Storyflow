import { getPrisma } from "./client";
import type { Prisma } from "./generated/client";

/**
 * Assets a project's timeline may reference: its own, global ones (projectId null) and, for an
 * EPISODE project, its parent's (R9).
 */
export async function projectAssetWhere(projectId: string): Promise<Prisma.AssetWhereInput> {
  const project = await getPrisma().project.findUnique({
    where: { id: projectId },
    select: { kind: true, parentProjectId: true },
  });
  const ids = [projectId];
  if (project?.kind === "EPISODE" && project.parentProjectId) ids.push(project.parentProjectId);
  return { OR: [{ projectId: { in: ids } }, { projectId: null }] };
}

export async function projectAssets(projectId: string) {
  return getPrisma().asset.findMany({ where: await projectAssetWhere(projectId) });
}
