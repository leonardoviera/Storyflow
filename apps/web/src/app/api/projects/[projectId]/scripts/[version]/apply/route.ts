import { z } from "zod";
import { json, route, type Params } from "@/server/http";
import { applyScript } from "@/server/scripts";

export const POST = route(async (_req, { params }: Params<{ projectId: string; version: string }>) => {
  const { projectId, version } = await params;
  return json(await applyScript(projectId, z.coerce.number().int().min(1).parse(version)));
});
