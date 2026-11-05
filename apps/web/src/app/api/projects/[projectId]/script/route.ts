import { body, json, route, type Params } from "@/server/http";
import { getScript, putScript, ScriptWrite } from "@/server/script";

type Ctx = Params<{ projectId: string }>;

export const dynamic = "force-dynamic";

export const GET = route(async (_req, { params }: Ctx) => json(await getScript((await params).projectId)));

export const PUT = route(async (req, { params }: Ctx) =>
  json(await putScript((await params).projectId, await body(req, ScriptWrite))),
);
