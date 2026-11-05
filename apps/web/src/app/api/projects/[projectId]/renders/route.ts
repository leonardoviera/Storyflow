import { body, json, route, type Params } from "@/server/http";
import { createRender, listRenders, RenderRequest } from "@/server/renders";

type Ctx = Params<{ projectId: string }>;

export const GET = route(async (_req, { params }: Ctx) => json(await listRenders((await params).projectId)));

export const POST = route(async (req, { params }: Ctx) => {
  const { status, render } = await createRender((await params).projectId, await body(req, RenderRequest));
  return json(render, status);
});
