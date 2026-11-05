import { json, route, type Params } from "@/server/http";
import { completeUpload } from "@/server/assets";

export const POST = route(async (_req, { params }: Params<{ assetId: string }>) =>
  json(await completeUpload((await params).assetId)),
);
