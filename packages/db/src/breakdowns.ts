import { getPrisma } from "./client";
import type { BreakdownStatus } from "./generated/enums";
import type { Prisma } from "./generated/client";

// Breakdown persistence (data-model.md §1). The document is validated by callers with the shared
// Zod schema; here it is opaque JSON with an `episodes` array keyed by id.

export class ConflictError extends Error {}

type EpisodeJson = { id: string } & Record<string, unknown>;
type DocumentJson = { episodes: EpisodeJson[] } & Record<string, unknown>;

export async function nextBreakdownVersion(projectId: string): Promise<number> {
  const last = await getPrisma().breakdown.aggregate({ where: { projectId }, _max: { version: true } });
  return (last._max.version ?? 0) + 1;
}

/** Optimistic write for review autosave: fails with ConflictError when `revision` moved on. */
export async function updateBreakdownDocument(
  id: string,
  baseRevision: number,
  document: Prisma.InputJsonValue,
  status?: BreakdownStatus,
) {
  const prisma = getPrisma();
  const { count } = await prisma.breakdown.updateMany({
    where: { id, revision: baseRevision },
    data: { document, revision: { increment: 1 }, ...(status ? { status } : {}) },
  });
  if (count === 0) throw new ConflictError("Breakdown was changed elsewhere (stale baseRevision)");
  return prisma.breakdown.findUniqueOrThrow({ where: { id } });
}

/**
 * Replace one episode inside the stored document under a row lock, so episode passes and other
 * writers never lose each other's changes (R7). Returns the new revision.
 */
export async function writeEpisodeResult(breakdownId: string, episodeId: string, episode: EpisodeJson) {
  return getPrisma().$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ document: DocumentJson; revision: number }[]>`
      SELECT "document", "revision" FROM "Breakdown" WHERE "id" = ${breakdownId} FOR UPDATE`;
    const row = rows[0];
    if (!row) throw new Error(`Breakdown ${breakdownId} not found`);
    const index = row.document.episodes.findIndex((e) => e.id === episodeId);
    if (index < 0) throw new Error(`Episode ${episodeId} not in breakdown ${breakdownId}`);
    const episodes = row.document.episodes.slice();
    episodes[index] = episode;
    const document = { ...row.document, episodes } as Prisma.InputJsonValue;
    await tx.breakdown.update({ where: { id: breakdownId }, data: { document, revision: row.revision + 1 } });
    return row.revision + 1;
  });
}
