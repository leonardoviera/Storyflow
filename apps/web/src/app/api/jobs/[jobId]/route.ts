import { json, route, type Params } from "@/server/http";
import { getJob } from "@/server/jobs";

export const dynamic = "force-dynamic";

export const GET = route(async (_req, { params }: Params<{ jobId: string }>) => json(await getJob((await params).jobId)));
