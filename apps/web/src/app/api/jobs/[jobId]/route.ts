import { json, route, type Params } from "@/server/http";
import { getJobView } from "@/server/jobs";

export const dynamic = "force-dynamic";

export const GET = route(async (_req, { params }: Params<{ jobId: string }>) => json(await getJobView((await params).jobId)));
