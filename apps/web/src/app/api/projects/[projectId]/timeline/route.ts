import { body, json, route, type Params } from "@/server/http";
import { getTimeline, putTimeline, TimelineWrite } from "@/server/timeline";

type Ctx = Params<{ projectId: string }>;

export const GET = route(async (_req, { params }: Ctx) => json(await getTimeline((await params).projectId)));

export const PUT = route(async (req, { params }: Ctx) =>
  json(await putTimeline((await params).projectId, await body(req, TimelineWrite))),
);
