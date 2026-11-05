import mammoth from "mammoth";
import { z } from "zod";
import { getPrisma, type Prisma } from "@storyflow/db";
import { countWords, ScriptSettings } from "@storyflow/shared/breakdown";
import { getEnv } from "@storyflow/shared/env";
import { assetObjectKey, extensionFor, uploadBuffer } from "@storyflow/storage";
import { ApiError, ConflictError } from "./errors";
import { getProject } from "./projects";

// Script screen (US1): one ProjectScript per STANDARD project, autosaved with an optimistic
// revision (FR-004, FR-005), plus text extraction from uploaded files (R8).

export const MAX_SCRIPT_WORDS = 50_000;
export const MAX_SCRIPT_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ScriptWrite = ScriptSettings.extend({
  baseRevision: z.number().int().min(0),
  text: z.string(),
  origin: z.enum(["PASTE", "UPLOAD", "GENERATED"]).optional(),
  sourceAssetId: z.string().nullable().optional(),
});

function tooManyWords(words: number) {
  return new ApiError(422, "TOO_MANY_WORDS", `The script has ${words} words; the limit is ${MAX_SCRIPT_WORDS}`);
}

export async function getScript(projectId: string) {
  await getProject(projectId);
  return getPrisma().projectScript.upsert({
    where: { projectId },
    create: { projectId, text: "", origin: "PASTE" },
    update: {},
  });
}

export async function putScript(projectId: string, input: z.infer<typeof ScriptWrite>) {
  await getScript(projectId);
  const words = countWords(input.text);
  if (words > MAX_SCRIPT_WORDS) throw tooManyWords(words);
  const prisma = getPrisma();
  const data: Prisma.ProjectScriptUncheckedUpdateManyInput = {
    text: input.text,
    aspectRatio: input.aspectRatio,
    episodeSeconds: input.episodeSeconds,
    episodeCount: input.episodeCount,
    revision: { increment: 1 },
    ...(input.origin ? { origin: input.origin } : {}),
    ...(input.sourceAssetId !== undefined ? { sourceAssetId: input.sourceAssetId } : {}),
  };
  const { count } = await prisma.projectScript.updateMany({ where: { projectId, revision: input.baseRevision }, data });
  if (count === 0) throw new ConflictError("The script was changed elsewhere (stale baseRevision)");
  return prisma.projectScript.findUniqueOrThrow({ where: { projectId } });
}

const MIME_BY_EXT: Record<string, string> = {
  txt: "text/plain",
  md: "text/markdown",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** Extract the text of an uploaded script and keep the original; does not touch the script. */
export async function extractUpload(projectId: string, file: File) {
  await getProject(projectId);
  if (file.size > MAX_SCRIPT_UPLOAD_BYTES) throw new ApiError(413, "TOO_LARGE", "The file is over 10 MB");
  const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const mimeType = MIME_BY_EXT[ext];
  if (!mimeType) throw new ApiError(422, "UNSUPPORTED_TYPE", "Only .txt, .md and .docx files are supported");

  const bytes = new Uint8Array(await file.arrayBuffer());
  let text: string;
  if (ext === "docx") {
    try {
      text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
    } catch {
      throw new ApiError(422, "DOCX_UNREADABLE", "The .docx file could not be read (corrupt or password-protected)");
    }
  } else {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new ApiError(422, "NOT_UTF8", "The file is not UTF-8 text");
    }
  }
  text = text.replace(/^\uFEFF/, "");
  const wordCount = countWords(text);
  if (wordCount > MAX_SCRIPT_WORDS) throw tooManyWords(wordCount);

  const prisma = getPrisma();
  const bucket = getEnv().S3_BUCKET_ASSETS;
  const asset = await prisma.asset.create({
    data: {
      projectId,
      kind: "DOCUMENT",
      status: "PENDING",
      source: "UPLOAD",
      bucket,
      objectKey: `pending/${crypto.randomUUID()}`,
      mimeType,
      metadata: { filename: file.name },
    },
  });
  const objectKey = assetObjectKey(projectId, "DOCUMENT", asset.id, extensionFor("DOCUMENT", mimeType)!);
  const { sha256, sizeBytes } = await uploadBuffer(bucket, objectKey, bytes, mimeType);
  await prisma.asset.update({
    where: { id: asset.id },
    data: { objectKey, status: "READY", sha256, sizeBytes: BigInt(sizeBytes) },
  });
  return { text, wordCount, sourceAssetId: asset.id };
}
