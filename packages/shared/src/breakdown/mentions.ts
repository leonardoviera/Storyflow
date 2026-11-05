import type { BibleAsset, BibleVariant, BreakdownDocument } from "./document";

// Mentions (R11): shot text stores `@{variantId}` tokens; the editor shows `@Name·Variant`
// labels (`@Name` for the variant called "default") and maps them back by exact match.

export const MENTION_TOKEN = /@\{([A-Za-z0-9_-]{12})\}/g;
const DEFAULT_VARIANT = "default";

/** `@word` that is not a token, at the start of the text or after whitespace. */
const LOOSE_LABEL = /(^|\s)@(?!\{)[\p{L}\p{N}_]/gu;

function findVariant(doc: BreakdownDocument, variantId: string): { asset: BibleAsset; variant: BibleVariant } | null {
  for (const asset of doc.assets) {
    const variant = asset.variants.find((v) => v.id === variantId);
    if (variant) return { asset, variant };
  }
  return null;
}

export function labelFor(doc: BreakdownDocument, variantId: string): string | null {
  const found = findVariant(doc, variantId);
  if (!found) return null;
  const { asset, variant } = found;
  return variant.name === DEFAULT_VARIANT ? `@${asset.name}` : `@${asset.name}·${variant.name}`;
}

export function tokensToLabels(text: string, doc: BreakdownDocument): string {
  return text.replace(MENTION_TOKEN, (token, id: string) => labelFor(doc, id) ?? token);
}

export function labelsToTokens(text: string, doc: BreakdownDocument): string {
  // Longest label first, so "@Ana·Jaleco" wins over "@Ana".
  const labels = doc.assets
    .flatMap((a) => a.variants.map((v) => ({ label: labelFor(doc, v.id)!, id: v.id })))
    .sort((a, b) => b.label.length - a.label.length);
  let out = "";
  let i = 0;
  outer: while (i < text.length) {
    if (text[i] === "@") {
      for (const { label, id } of labels) {
        if (text.startsWith(label, i) && !/[\p{L}\p{N}_]/u.test(text[i + label.length] ?? "")) {
          out += `@{${id}}`;
          i += label.length;
          continue outer;
        }
      }
    }
    out += text[i];
    i += 1;
  }
  return out;
}

export function extractMentionIds(text: string): string[] {
  return [...text.matchAll(MENTION_TOKEN)].map((m) => m[1]!);
}

/** True when the text still holds an `@label` that did not map to any variant. */
export function hasUnresolvedLabel(text: string): boolean {
  return new RegExp(LOOSE_LABEL.source, LOOSE_LABEL.flags).test(text);
}

/**
 * Shots that reference an asset or one of its variants: by mention token, as a speaker, or
 * through their segment's setting. Used for the delete confirmation count (FR-020).
 */
export function usageOf(doc: BreakdownDocument, id: string): { shotCount: number; shotIds: string[] } {
  const asset = doc.assets.find((a) => a.id === id);
  const variantIds = new Set(asset ? asset.variants.map((v) => v.id) : [id]);
  const owner = asset ?? doc.assets.find((a) => a.variants.some((v) => v.id === id));
  const shotIds: string[] = [];
  for (const episode of doc.episodes) {
    for (const segment of episode.segments) {
      const viaSetting = variantIds.has(segment.settingVariantId);
      for (const shot of segment.shots) {
        const viaToken = extractMentionIds(shot.action).some((m) => variantIds.has(m));
        const viaSpeaker = !!asset && shot.lines.some((l) => l.speakerAssetId === owner?.id);
        if (viaSetting || viaToken || viaSpeaker) shotIds.push(shot.id);
      }
    }
  }
  return { shotCount: shotIds.length, shotIds };
}
