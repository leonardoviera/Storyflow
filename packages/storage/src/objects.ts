import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import { GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { internalS3, publicS3Signer } from "./client";

export const PRESIGN_EXPIRES_SECONDS = 15 * 60;

export type UrlMode = "public" | "internal";

export async function presignPut(bucket: string, key: string, mimeType: string, sizeBytes: number) {
  const url = await getSignedUrl(
    publicS3Signer(),
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: mimeType, ContentLength: sizeBytes }),
    { expiresIn: PRESIGN_EXPIRES_SECONDS },
  );
  return { url, expiresAt: new Date(Date.now() + PRESIGN_EXPIRES_SECONDS * 1000) };
}

export async function presignGet(bucket: string, key: string, mode: UrlMode) {
  const client = mode === "public" ? publicS3Signer() : internalS3();
  const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: PRESIGN_EXPIRES_SECONDS,
  });
  return { url, expiresAt: new Date(Date.now() + PRESIGN_EXPIRES_SECONDS * 1000) };
}

/** Returns object metadata, or null when the object does not exist. */
export async function headObject(bucket: string, key: string) {
  try {
    const res = await internalS3().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { sizeBytes: res.ContentLength ?? 0, contentType: res.ContentType ?? null };
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || (err as Error).name === "NotFound") return null;
    throw err;
  }
}

export async function getObjectStream(bucket: string, key: string): Promise<Readable> {
  const res = await internalS3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return res.Body as Readable;
}

/** Streams the object through SHA-256. */
export async function sha256Object(bucket: string, key: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of await getObjectStream(bucket, key)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

/** Reads up to `maxBytes` of an object (for media probing). */
export async function readObjectPrefix(bucket: string, key: string, maxBytes: number): Promise<Buffer> {
  const res = await internalS3().send(
    new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${maxBytes - 1}` }),
  );
  const chunks: Buffer[] = [];
  for await (const chunk of res.Body as Readable) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** Multipart upload of a local file; returns its sha256 and size. */
export async function uploadFile(bucket: string, key: string, path: string, mimeType: string) {
  const hash = createHash("sha256");
  let sizeBytes = 0;
  const stream = createReadStream(path);
  stream.on("data", (chunk) => {
    hash.update(chunk as Buffer);
    sizeBytes += chunk.length;
  });
  await new Upload({
    client: internalS3(),
    params: { Bucket: bucket, Key: key, Body: stream, ContentType: mimeType },
    queueSize: 2,
    partSize: 16 * 1024 * 1024,
  }).done();
  return { sha256: hash.digest("hex"), sizeBytes };
}

/** Single-request upload of a small in-memory object; returns its sha256 and size. */
export async function uploadBuffer(bucket: string, key: string, data: Uint8Array, mimeType: string) {
  await internalS3().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: data, ContentType: mimeType }));
  return { sha256: createHash("sha256").update(data).digest("hex"), sizeBytes: data.byteLength };
}

/** HeadBucket on each bucket; throws if any is unreachable. */
export async function assertBucketsReachable(buckets: string[]): Promise<void> {
  for (const Bucket of buckets) await internalS3().send(new HeadBucketCommand({ Bucket }));
}
