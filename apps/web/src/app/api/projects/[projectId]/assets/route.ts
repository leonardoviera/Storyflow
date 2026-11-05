import { z } from "zod";
import { json, route, type Params } from "@/server/http";
import { listAssets } from "@/server/assets";

const Kind = z.enum(["IMAGE", "VIDEO", "AUDIO", "MODEL_3D", "RENDER_3D", "FONT", "FINAL_RENDER"]).optional();

export const GET = route(async (req, { params }: Params<{ projectId: string }>) => {
  const kind = Kind.parse(new URL(req.url).searchParams.get("kind") ?? undefined);
  return json(await listAssets((await params).projectId, kind));
});
