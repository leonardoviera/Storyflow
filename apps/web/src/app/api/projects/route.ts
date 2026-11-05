import { body, json, route } from "@/server/http";
import { createProject, listProjects, ProjectCreate } from "@/server/projects";

export const dynamic = "force-dynamic";

export const GET = route(async () => json(await listProjects()));

export const POST = route(async (req) => json(await createProject(await body(req, ProjectCreate)), 201));
