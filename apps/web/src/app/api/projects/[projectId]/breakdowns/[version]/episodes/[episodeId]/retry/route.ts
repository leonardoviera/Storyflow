import { z } from "zod";
import { json, route, type Params } from "@/server/http";
import { retryEpisode } from "@/server/breakdowns";

type Ctx = Params<{ projectId: string; version: string; episodeId: string }>;

export const dynamic = "force-dynamic";

export const POST = route(async (_req, { params }: Ctx) => {
  const { projectId, version, episodeId } = await params;
  return json(await retryEpisode(projectId, z.coerce.number().int().min(1).parse(version), episodeId), 202);
});
