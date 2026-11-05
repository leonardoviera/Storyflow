import { json, route, type Params } from "@/server/http";
import { ValidationError } from "@/server/errors";
import { extractUpload } from "@/server/script";

type Ctx = Params<{ projectId: string }>;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req, { params }: Ctx) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    throw new ValidationError("Expected multipart/form-data with a file field", [{ path: ["file"], message: "required" }]);
  }
  return json(await extractUpload((await params).projectId, file));
});
