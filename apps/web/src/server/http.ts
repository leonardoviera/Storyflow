import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AssetNotReadyError } from "@storyflow/storage";
import { ConflictError, NotFoundError, ValidationError } from "./errors";

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Maps domain errors to HTTP. Unknown errors → 500 without stack traces in the body. */
export function route<C>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ZodError) {
        return NextResponse.json({ error: "Validation failed", issues: err.issues }, { status: 422 });
      }
      if (err instanceof ValidationError) {
        return NextResponse.json({ error: err.message, issues: err.issues }, { status: 422 });
      }
      if (err instanceof AssetNotReadyError) {
        return NextResponse.json(
          { error: err.message, issues: err.assetIds.map((id) => ({ path: ["assets", id], message: "not READY" })) },
          { status: 422 },
        );
      }
      if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
      if (err instanceof ConflictError) return NextResponse.json({ error: err.message }, { status: 409 });
      console.error(JSON.stringify({ msg: "unhandled api error", url: req.url, err: String(err), stack: (err as Error)?.stack }));
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

export async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown = {};
  const text = await req.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new ValidationError("Body is not valid JSON", [{ path: [], message: "invalid JSON" }]);
    }
  }
  return schema.parse(json);
}

/** JSON response that serialises BigInt (Asset.sizeBytes). */
export function json(data: unknown, status = 200): Response {
  return new NextResponse(
    JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? Number(v) : v)),
    { status, headers: { "content-type": "application/json" } },
  );
}

export type Params<T extends Record<string, string>> = { params: Promise<T> };
