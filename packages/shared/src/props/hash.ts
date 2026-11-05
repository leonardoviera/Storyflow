import { createHash } from "node:crypto";
import type { StoryCompositionProps } from "../schemas/composition-props";
import { canonicalJson, referencedAssetIds, REMOTION_VERSION } from "./canonical";

// Server-only (node:crypto). Kept apart from canonical.ts so the browser can build props.

/**
 * SHA-256 over canonical JSON (sorted keys, no assetUrls) + referenced assets' sha256 sorted by id
 * + compositionId + Remotion version.
 */
export function hashCanonicalProps(
  props: StoryCompositionProps,
  assetSha256ById: Record<string, string>,
  compositionId: string,
  remotionVersion: string = REMOTION_VERSION,
): string {
  const { assetUrls: _ignored, ...canonical } = props;
  const assetPart = referencedAssetIds(props)
    .map((id) => `${id}:${assetSha256ById[id] ?? ""}`)
    .join(",");
  return createHash("sha256")
    .update(canonicalJson(canonical))
    .update("\n")
    .update(assetPart)
    .update("\n")
    .update(compositionId)
    .update("\n")
    .update(remotionVersion)
    .digest("hex");
}
