// data-model.md → Asset.objectKey pattern and per-kind MIME allow-list.

export type AssetKindName =
  | "IMAGE"
  | "VIDEO"
  | "AUDIO"
  | "MODEL_3D"
  | "RENDER_3D"
  | "FONT"
  | "FINAL_RENDER";

export const MIME_ALLOW_LIST: Record<AssetKindName, Record<string, string>> = {
  IMAGE: { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" },
  VIDEO: { "video/mp4": "mp4", "video/webm": "webm" },
  AUDIO: { "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg" },
  MODEL_3D: { "model/gltf-binary": "glb" },
  RENDER_3D: { "image/png": "png", "video/webm": "webm" },
  FONT: { "font/woff2": "woff2" },
  FINAL_RENDER: { "video/mp4": "mp4" },
};

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // "Upload limit 2 GiB"

export function extensionFor(kind: AssetKindName, mimeType: string): string | null {
  return MIME_ALLOW_LIST[kind][mimeType] ?? null;
}

/** `projects/{projectId}/{kind}/{assetId}.{ext}` */
export function assetObjectKey(projectId: string, kind: AssetKindName, assetId: string, ext: string): string {
  return `projects/${projectId}/${kind}/${assetId}.${ext}`;
}
