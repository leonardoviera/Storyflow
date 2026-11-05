import { body, json, route, type Params } from "@/server/http";
import { archiveProject, getProject, ProjectUpdate, updateProject } from "@/server/projects";

type Ctx = Params<{ projectId: string }>;

export const GET = route(async (_req, { params }: Ctx) => json(await getProject((await params).projectId)));

export const PATCH = route(async (req, { params }: Ctx) =>
  json(await updateProject((await params).projectId, await body(req, ProjectUpdate))),
);

export const DELETE = route(async (_req, { params }: Ctx) => {
  await archiveProject((await params).projectId);
  return new Response(null, { status: 204 });
});
