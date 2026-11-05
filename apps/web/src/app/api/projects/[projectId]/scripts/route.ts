import { z } from "zod";
import { body, json, route, type Params } from "@/server/http";
import { listScripts, saveManualScript } from "@/server/scripts";

type Ctx = Params<{ projectId: string }>;

export const GET = route(async (_req, { params }: Ctx) => json(await listScripts((await params).projectId)));

export const POST = route(async (req, { params }: Ctx) =>
  json(await saveManualScript((await params).projectId, await body(req, z.unknown())), 201),
);
