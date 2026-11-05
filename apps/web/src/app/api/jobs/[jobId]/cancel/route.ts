import { json, route, type Params } from "@/server/http";
import { cancelJob } from "@/server/jobs";

export const POST = route(async (_req, { params }: Params<{ jobId: string }>) =>
  json(await cancelJob((await params).jobId)),
);
