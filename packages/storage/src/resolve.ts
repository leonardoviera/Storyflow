import type { StoryCompositionProps } from "@storyflow/shared/schemas";
import { presignGet, type UrlMode } from "./objects";

export interface ResolvableAsset {
  id: string;
  bucket: string;
  objectKey: string;
  status: string;
}

export class AssetNotReadyError extends Error {
  constructor(public readonly assetIds: string[]) {
    super(`Assets not READY: ${assetIds.join(", ")}`);
  }
}

/**
 * Canonical → resolved props: fills `assetUrls` with presigned GETs for the given context
 * (research.md R9). Throws if any referenced asset is missing or not READY.
 */
export async function resolveProps(
  canonical: StoryCompositionProps,
  assets: ResolvableAsset[],
  mode: UrlMode,
): Promise<StoryCompositionProps> {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const referenced = [
    ...new Set(canonical.tracks.flatMap((t) => t.clips.map((c) => c.assetId)).filter((x): x is string => !!x)),
  ];
  const notReady = referenced.filter((id) => byId.get(id)?.status !== "READY");
  if (notReady.length) throw new AssetNotReadyError(notReady);

  const entries = await Promise.all(
    referenced.map(async (id) => {
      const asset = byId.get(id)!;
      return [id, (await presignGet(asset.bucket, asset.objectKey, mode)).url] as const;
    }),
  );
  return { ...canonical, assetUrls: Object.fromEntries(entries) };
}
