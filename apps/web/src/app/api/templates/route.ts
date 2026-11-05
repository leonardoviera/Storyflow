import { getPrisma } from "@storyflow/db";
import { json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => json(await getPrisma().template.findMany({ orderBy: { name: "asc" } })));
