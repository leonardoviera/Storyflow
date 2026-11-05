import { z } from "zod";
import { json, route, type Params } from "@/server/http";
import { getBreakdown } from "@/server/breakdowns";

type Ctx = Params<{ projectId: string; version: string }>;

export const dynamic = "force-dynamic";

const Version = z.coerce.number().int().min(1);

export const GET = route(async (_req, { params }: Ctx) => {
  const { projectId, version } = await params;
  return json(await getBreakdown(projectId, Version.parse(version)));
});
