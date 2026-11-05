import { body, json, route, type Params } from "@/server/http";
import { createUpload, UploadRequest } from "@/server/assets";

export const POST = route(async (req, { params }: Params<{ projectId: string }>) =>
  json(await createUpload((await params).projectId, await body(req, UploadRequest)), 201),
);
