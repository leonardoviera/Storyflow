import { json, route, type Params } from "@/server/http";
import { listBreakdowns, startBreakdown } from "@/server/breakdowns";

type Ctx = Params<{ projectId: string }>;

export const dynamic = "force-dynamic";

export const GET = route(async (_req, { params }: Ctx) => json(await listBreakdowns((await params).projectId)));

export const POST = route(async (_req, { params }: Ctx) => json(await startBreakdown((await params).projectId), 202));
