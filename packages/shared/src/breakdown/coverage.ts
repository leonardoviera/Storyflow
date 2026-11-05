import type { SourceLine } from "./document";

// Line coverage (R1): every source line in an episode's range must be used exactly once, either
// as a spoken line or as an action/heading line. Missing or duplicated ids go back to the model.

export function checkCoverage(
  lineIds: string[],
  shots: { spokenLineIds: string[]; actionLineIds: string[] }[],
): { missing: string[]; duplicated: string[] } {
  const seen = new Map<string, number>();
  for (const shot of shots) {
    for (const id of [...shot.spokenLineIds, ...shot.actionLineIds]) seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  return {
    missing: lineIds.filter((id) => !seen.has(id)),
    duplicated: lineIds.filter((id) => (seen.get(id) ?? 0) > 1),
  };
}

/** Lines from `from` to `to` inclusive, in source order; empty when either id is unknown. */
export function linesInRange(sourceLines: SourceLine[], from: string, to: string): SourceLine[] {
  const start = sourceLines.findIndex((l) => l.id === from);
  const end = sourceLines.findIndex((l) => l.id === to);
  if (start < 0 || end < start) return [];
  return sourceLines.slice(start, end + 1);
}
