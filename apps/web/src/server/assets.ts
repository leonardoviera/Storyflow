import { z } from "zod";
import { imageSize } from "image-size";
import { getPrisma, type AssetKind } from "@storyflow/db";
import { getEnv } from "@storyflow/shared/env";
import {
  assetObjectKey,
  extensionFor,
  headObject,
  MAX_UPLOAD_BYTES,
  presignGet,
  presignPut,
  readObjectPrefix,
  sha256Object,
  type AssetKindName,
} from "@storyflow/storage";
import { ConflictError, NotFoundError, ValidationError } from "./errors";
import { getProject } from "./projects";

const UPLOADABLE = ["IMAGE", "VIDEO", "AUDIO", "MODEL_3D", "FONT"] as const;

export const UploadRequest = z.object({
  kind: z.enum(UPLOADABLE),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES), // "Upload limit 2 GiB"
  filename: z.string().min(1).max(255),
});

export async function createUpload(projectId: string, input: z.infer<typeof UploadRequest>) {
  await getProject(projectId);
  const ext = extensionFor(input.kind, input.mimeType);
  if (!ext) {
    throw new ValidationError("Unsupported file type", [
      { path: ["mimeType"], message: `${input.mimeType} is not allowed for ${input.kind}` },
    ]);
  }
  const prisma = getPrisma();
  const bucket = getEnv().S3_BUCKET_ASSETS;
  const asset = await prisma.asset.create({
    data: {
      projectId,
      kind: input.kind,
      status: "PENDING",
      source: "UPLOAD",
      bucket,
      objectKey: `pending/${crypto.randomUUID()}`,
      mimeType: input.mimeType,
      sizeBytes: BigInt(input.sizeBytes),
      metadata: { filename: input.filename },
    },
  });
  const objectKey = assetObjectKey(projectId, input.kind, asset.id, ext);
  const updated = await prisma.asset.update({ where: { id: asset.id }, data: { objectKey } });
  const { url, expiresAt } = await presignPut(bucket, objectKey, input.mimeType, input.sizeBytes);
  return { asset: updated, uploadUrl: url, expiresAt };
}

async function probe(kind: AssetKind, bucket: string, key: string, mimeType: string) {
  if (kind === "IMAGE") {
    const { width, height } = imageSize(await readObjectPrefix(bucket, key, 512 * 1024));
    return { width: width ?? null, height: height ?? null, durationMs: null };
  }
  if (kind === "VIDEO" || kind === "AUDIO") {
    // Local media parsing via a presigned internal URL (no external services).
    const { parseMedia } = await import("@remotion/media-parser");
    const { url } = await presignGet(bucket, key, "internal");
    const meta = await parseMedia({ src: url, fields: { durationInSeconds: true, dimensions: true } });
    return {
      width: meta.dimensions?.width ?? null,
      height: meta.dimensions?.height ?? null,
      durationMs: meta.durationInSeconds ? Math.round(meta.durationInSeconds * 1000) : null,
    };
  }
  void mimeType;
  return { width: null, height: null, durationMs: null };
}

export async function completeUpload(assetId: string) {
  const prisma = getPrisma();
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw new NotFoundError("Asset");
  if (asset.status === "READY") return asset;
  const head = await headObject(asset.bucket, asset.objectKey);
  if (!head) throw new ConflictError("Object not found in MinIO — upload it first");
  if (asset.sizeBytes !== null && BigInt(head.sizeBytes) !== asset.sizeBytes) {
    throw new ConflictError(`Size mismatch: expected ${asset.sizeBytes}, got ${head.sizeBytes}`);
  }
  const sha256 = await sha256Object(asset.bucket, asset.objectKey);
  const dims = await probe(asset.kind, asset.bucket, asset.objectKey, asset.mimeType).catch(() => ({
    width: null,
    height: null,
    durationMs: null,
  }));
  return prisma.asset.update({
    where: { id: assetId },
    data: { status: "READY", sha256, sizeBytes: BigInt(head.sizeBytes), ...dims },
  });
}

export async function listAssets(projectId: string, kind?: AssetKindName) {
  await getProject(projectId);
  return getPrisma().asset.findMany({
    where: { projectId, ...(kind ? { kind } : {}) },
    orderBy: { createdAt: "desc" },
  });
}

export async function assetUrl(assetId: string) {
  const asset = await getPrisma().asset.findUnique({ where: { id: assetId } });
  if (!asset || asset.status !== "READY") throw new NotFoundError("Asset");
  return presignGet(asset.bucket, asset.objectKey, "public");
}
