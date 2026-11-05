import { z } from "zod";
import { enqueueAsset3d } from "@storyflow/db/asset3d";
import { BlenderToolName } from "@storyflow/shared/schemas";
import { body, json, route, type Params } from "@/server/http";
import { getProject } from "@/server/projects";

const Request3d = z.object({
  sceneId: z.string().optional(),
  tool: BlenderToolName,
  params: z.record(z.string(), z.unknown()),
});

export const POST = route(async (req, { params }: Params<{ projectId: string }>) => {
  const { projectId } = await params;
  await getProject(projectId);
  const input = await body(req, Request3d);
  const { job } = await enqueueAsset3d({ projectId, ...input }); // ZodError → 422
  return json(job, 202);
});
