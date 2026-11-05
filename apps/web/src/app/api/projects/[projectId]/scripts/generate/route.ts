import { body, json, route, type Params } from "@/server/http";
import { enqueueGenerate, GenerateRequest } from "@/server/scripts";

export const POST = route(async (req, { params }: Params<{ projectId: string }>) =>
  json(await enqueueGenerate((await params).projectId, await body(req, GenerateRequest)), 202),
);
