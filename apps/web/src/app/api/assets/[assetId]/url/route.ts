import { json, route, type Params } from "@/server/http";
import { assetUrl } from "@/server/assets";

export const GET = route(async (_req, { params }: Params<{ assetId: string }>) =>
  json(await assetUrl((await params).assetId)),
);
