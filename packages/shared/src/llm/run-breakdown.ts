import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { z } from "zod";
import { checkCoverage, linesInRange } from "../breakdown/coverage";
import {
  FPS,
  newId,
  secondsToFrames,
  type BibleAsset,
  type BibleVariant,
  type BreakdownDocument,
  type Episode,
  type ScriptSettings,
  type Segment,
  type Shot,
  type ShotVisual,
  type SourceLine,
} from "../breakdown/document";
import { fitDurations } from "../breakdown/durations";
import {
  AnalyzeChunkOutput,
  AnalyzeChunkOutputJsonSchema,
  AnalyzeOutput,
  AnalyzeOutputJsonSchema,
  EpisodeOutput,
  EpisodeOutputJsonSchema,
} from "../breakdown/llm-schemas";
import { extractMentionIds } from "../breakdown/mentions";
import { estimateTokens } from "../breakdown/parse-script";
import {
  analyzeChunkSystemPrompt,
  analyzeReducePrompt,
  analyzeSystemPrompt,
  breakdownRepairPrompt,
  episodeSystemPrompt,
  formatAssetTable,
  formatFixedAssets,
  formatLines,
  formatSettings,
  guessLanguage,
} from "../breakdown/prompts";
import { Blender3dToolParams } from "../schemas/blender-tools";
import { llm } from "./client";
import { withLlmSlot } from "./slot";

// Breakdown passes (R3, contracts/llm-breakdown.md): one analyze pass (map-reduce for long
// scripts), then one episode pass per episode. Every call is structured, strict, serialized by
// withLlmSlot and gets up to 2 repair rounds for schema and semantic problems (R6).

export class BreakdownStepError extends Error {}

/** Thrown before an LLM call when the caller's shouldStop() says the job was cancelled. */
export class BreakdownCancelled extends Error {}

type ShouldStop = () => Promise<boolean>;

const MAX_REPAIRS = 2;
const MAP_REDUCE_TOKENS = 16_000;
const CHUNK_TOKENS = 12_000;
// Episode passes send about this many lines per call, cut at scene headings. With low reasoning
// effort the model often stops early on long line lists (T035: ~25 of 60 lines), so a window
// whose tail is missing is accepted and the tail goes into the next call.
const EPISODE_WINDOW_LINES = 15;
const EPISODE_WINDOW_MAX = 25;
const MIN_LINES_PER_EPISODE = 3;
const MODEL = "local-llm";
// gpt-oss spends most of its time reasoning at the default effort: a small structured call took
// 318 s at default and 17 s at "low" on the LAN server (T035). The output is checked by schema
// and by the semantic checks, so low effort is enough.
const REASONING_EFFORT = "low" as const;

function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

async function callStructured<S extends z.ZodType>(opts: {
  step: string;
  system: string;
  user: string;
  schema: S;
  jsonSchema: Record<string, unknown>;
  name: string;
  /** Deterministic fixes applied before the checks (e.g. speakers the server already knows). */
  normalize?: (out: z.infer<S>) => z.infer<S>;
  check?: (out: z.infer<S>) => string[];
  /** Checked before every LLM call (contracts/queue-jobs-delta.md "Cancellation"). */
  shouldStop?: ShouldStop;
}): Promise<z.infer<S>> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.user },
  ];
  let issues: string[] = [];
  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    if (await opts.shouldStop?.()) throw new BreakdownCancelled(`${opts.step}: cancelled`);
    // Streamed so long episode passes never hit fetch's 5-minute wait for response headers.
    const content = await withLlmSlot(async () => {
      const stream = await llm().chat.completions.create({
        model: MODEL,
        messages,
        temperature: 0.2,
        reasoning_effort: REASONING_EFFORT,
        stream: true,
        response_format: { type: "json_schema", json_schema: { name: opts.name, schema: opts.jsonSchema, strict: true } },
      });
      let text = "";
      for await (const chunk of stream) text += chunk.choices[0]?.delta?.content ?? "";
      return text;
    });
    issues = [];
    let json: unknown;
    try {
      json = JSON.parse(stripFences(content));
    } catch {
      issues = ["The response was not valid JSON."];
    }
    if (issues.length === 0) {
      const parsed = opts.schema.safeParse(json);
      if (!parsed.success) {
        issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
      } else {
        const out = opts.normalize ? opts.normalize(parsed.data) : parsed.data;
        issues = opts.check?.(out) ?? [];
        if (issues.length === 0) return out;
      }
    }
    messages.push({ role: "assistant", content }, { role: "user", content: breakdownRepairPrompt(issues.map((i) => `- ${i}`).join("\n")) });
  }
  throw new BreakdownStepError(`${opts.step}: the AI could not produce a valid result after ${MAX_REPAIRS} repairs (${issues.slice(0, 5).join("; ")})`);
}

// ---------------------------------------------------------------------------------------------
// Analyze pass

export interface AnalyzeResult {
  /** Synopsis and assets filled in; episodes pending with their line ranges and no segments. */
  doc: BreakdownDocument;
  /** speakerHint → CHARACTER asset id. */
  speakerMap: Record<string, string>;
  maxSensibleEpisodes: number;
}

type LlmAsset = AnalyzeOutput["assets"][number];

const norm = (s: string) => s.trim().toLowerCase();

const plain = (s: string) => norm(s).normalize("NFD").replace(/\p{M}/gu, "");

/**
 * Every speakerHint ends up mapped to a CHARACTER ref without a repair round: a wrong ref is
 * matched to a character with that name or alias (case- and accent-insensitive), and a speaker
 * the model forgot becomes a new character.
 */
function normalizeAnalyze(out: AnalyzeOutput, sourceLines: SourceLine[], fixed: BibleAsset[]): AnalyzeOutput {
  const characters = [
    ...out.assets.filter((a) => a.type === "CHARACTER").map((a) => ({ ref: a.ref, names: [a.name, ...a.aliases] })),
    ...fixed.filter((a) => a.type === "CHARACTER").map((a) => ({ ref: a.id, names: [a.name, ...a.aliases] })),
  ];
  const refs = new Set(characters.map((c) => c.ref));
  const mapped = new Map(out.speakerMap.map((m) => [m.speakerHint, m.assetRef]));
  const hints = [...new Set(sourceLines.map((l) => l.speakerHint).filter((h): h is string => !!h))];
  const speakerMap = hints.map((hint) => {
    const given = mapped.get(hint);
    if (given && refs.has(given)) return { speakerHint: hint, assetRef: given };
    const byName = characters.find(
      (c) => c.names.some((n) => plain(n) === plain(hint)) || (given !== undefined && plain(c.ref) === plain(given)),
    );
    if (byName) return { speakerHint: hint, assetRef: byName.ref };
    const ref = `speaker_${plain(hint).replace(/[^a-z0-9]+/g, "_")}`;
    const name = hint.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
    out.assets.push({ ref, type: "CHARACTER", name, aliases: [], description: "", variants: [{ ref: `${ref}_v`, name: "default", description: "" }] });
    characters.push({ ref, names: [name] });
    refs.add(ref);
    return { speakerHint: hint, assetRef: ref };
  });
  return { ...out, speakerMap };
}

function analyzeIssues(out: AnalyzeOutput, sourceLines: SourceLine[], fixed: BibleAsset[]): string[] {
  const issues: string[] = [];
  const index = new Map(sourceLines.map((l, i) => [l.id, i]));
  const starts = out.episodePlan.episodes.map((e) => e.startLineId);
  if (starts[0] !== sourceLines[0]?.id) issues.push(`episodePlan.episodes[0].startLineId must be ${sourceLines[0]?.id}`);
  starts.forEach((id, i) => {
    if (!index.has(id)) issues.push(`episodePlan.episodes[${i}].startLineId "${id}" is not a line id`);
    else if (i > 0 && index.get(id)! <= (index.get(starts[i - 1]!) ?? -1)) {
      issues.push(`episodePlan.episodes[${i}].startLineId "${id}" must come after "${starts[i - 1]}"`);
    }
  });
  // Episodes should be roughly the same length (each targets the same seconds).
  if (issues.length === 0 && starts.length > 1) {
    const bounds = [...starts.map((id) => index.get(id)!), sourceLines.length];
    const sizes = bounds.slice(1).map((b, i) => b - bounds[i]!);
    const even = sourceLines.length / starts.length;
    if (sizes.some((n) => n < even / 3)) {
      const suggested = starts.map((_, i) => sourceLines[Math.round(i * even)]!.id).join(", ");
      issues.push(`Episodes are very unequal (${sizes.join(", ")} lines); split at natural breaks near ${suggested}`);
    }
  }
  const characterRefs = new Set([
    ...out.assets.filter((a) => a.type === "CHARACTER").map((a) => a.ref),
    ...fixed.filter((a) => a.type === "CHARACTER").map((a) => a.id),
  ]);
  const mapped = new Map(out.speakerMap.map((m) => [m.speakerHint, m.assetRef]));
  for (const hint of new Set(sourceLines.map((l) => l.speakerHint).filter((h): h is string => !!h))) {
    const ref = mapped.get(hint);
    if (ref === undefined) issues.push(`speakerMap has no entry for speaker "${hint}"`);
    else if (!characterRefs.has(ref)) issues.push(`speakerMap "${hint}" points to "${ref}", which is not a CHARACTER ref`);
  }
  return issues;
}

function chunkOnHeadings(sourceLines: SourceLine[]): SourceLine[][] {
  const chunks: SourceLine[][] = [];
  let current: SourceLine[] = [];
  let tokens = 0;
  for (const line of sourceLines) {
    const t = estimateTokens(line.text) + 4;
    if (current.length > 0 && tokens + t > CHUNK_TOKENS && line.hint === "heading") {
      chunks.push(current);
      current = [];
      tokens = 0;
    }
    current.push(line);
    tokens += t;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** Turn model refs into real ids, merging same-type assets that share a name or alias (FR-015). */
function buildAssets(llmAssets: LlmAsset[], fixed: BibleAsset[]): { assets: BibleAsset[]; refToId: Map<string, string> } {
  const assets: BibleAsset[] = fixed.map((a) => structuredClone(a));
  const refToId = new Map<string, string>(fixed.map((a) => [a.id, a.id]));
  const keysOf = (a: { name: string; aliases: string[] }) => [a.name, ...a.aliases].map(norm).filter(Boolean);

  for (const raw of llmAssets) {
    // "Bakery - Night" is a look of "Bakery": one SETTING asset with a "Night" variant (R3).
    const look = raw.type === "SETTING" ? /^(.+?)\s+[-–—]\s+(.+)$/.exec(raw.name.trim()) : null;
    const incoming: LlmAsset = look
      ? {
          ...raw,
          name: look[1]!,
          variants: raw.variants.map((v) =>
            norm(v.name) === "default" || norm(v.name) === norm(raw.name) ? { ...v, name: look[2]! } : v,
          ),
        }
      : raw;
    const fixedMatch = assets.find((a) => a.id === incoming.ref);
    const keys = new Set(keysOf(incoming));
    const target = fixedMatch ?? assets.find((a) => a.type === incoming.type && keysOf(a).some((k) => keys.has(k)));
    const variants: BibleVariant[] = incoming.variants.map((v) => ({
      id: newId(),
      name: v.name.trim().slice(0, 60) || "default",
      description: v.description.slice(0, 1000),
      referenceAssetIds: [],
    }));
    if (target) {
      refToId.set(incoming.ref, target.id);
      if (target.libraryAssetId || fixedMatch) continue; // fixed assets are kept as imported
      const known = new Set(keysOf(target));
      for (const alias of [incoming.name, ...incoming.aliases]) {
        if (!known.has(norm(alias)) && target.aliases.length < 10) target.aliases.push(alias.slice(0, 80));
        known.add(norm(alias));
      }
      const names = new Set(target.variants.map((v) => norm(v.name)));
      for (const v of variants) {
        if (names.has(norm(v.name))) continue;
        target.variants.push(v);
        names.add(norm(v.name));
      }
      continue;
    }
    const id = newId();
    refToId.set(incoming.ref, id);
    const unique: BibleVariant[] = [];
    for (const v of variants) if (!unique.some((u) => norm(u.name) === norm(v.name))) unique.push(v);
    assets.push({
      id,
      type: incoming.type,
      name: incoming.name.trim().slice(0, 80) || incoming.ref,
      aliases: [...new Set(incoming.aliases.map((a) => a.slice(0, 80)))].filter((a) => norm(a) !== norm(incoming.name)).slice(0, 10),
      description: incoming.description.slice(0, 2000),
      variants: unique,
    });
  }
  return { assets, refToId };
}

export async function runAnalyze(opts: {
  sourceLines: SourceLine[];
  settings: ScriptSettings;
  fixedAssets: BibleAsset[];
  onStep?: (message: string) => void | Promise<void>;
  shouldStop?: ShouldStop;
}): Promise<AnalyzeResult> {
  const { sourceLines, settings, fixedAssets } = opts;
  if (sourceLines.length === 0) throw new BreakdownStepError("The script is empty");
  const header = `${formatSettings(settings)}\n${formatFixedAssets(fixedAssets)}`;
  const check = (out: AnalyzeOutput) => analyzeIssues(out, sourceLines, fixedAssets);
  const normalize = (out: AnalyzeOutput) => normalizeAnalyze(out, sourceLines, fixedAssets);

  let out: AnalyzeOutput;
  if (estimateTokens(formatLines(sourceLines)) <= MAP_REDUCE_TOKENS) {
    out = await callStructured({
      step: "Analysis",
      system: analyzeSystemPrompt(settings),
      user: `${header}\nLINES:\n${formatLines(sourceLines)}`,
      schema: AnalyzeOutput,
      jsonSchema: AnalyzeOutputJsonSchema,
      name: "AnalyzeOutput",
      normalize,
      check,
      shouldStop: opts.shouldStop,
    });
  } else {
    const chunks = chunkOnHeadings(sourceLines);
    const parts: AnalyzeChunkOutput[] = [];
    for (const [i, chunk] of chunks.entries()) {
      await opts.onStep?.(`analyze part ${i + 1}/${chunks.length}`);
      parts.push(
        await callStructured({
          step: `Analysis (part ${i + 1} of ${chunks.length})`,
          system: analyzeChunkSystemPrompt(),
          user: `${formatFixedAssets(fixedAssets)}\nLINES:\n${formatLines(chunk)}`,
          schema: AnalyzeChunkOutput,
          jsonSchema: AnalyzeChunkOutputJsonSchema,
          name: "AnalyzeChunkOutput",
          shouldStop: opts.shouldStop,
        }),
      );
    }
    await opts.onStep?.("analyze merge");
    const headings = sourceLines.filter((l) => l.hint === "heading");
    out = await callStructured({
      step: "Analysis (merge)",
      system: analyzeReducePrompt(settings),
      user: `${header}\nFIRST_LINE: ${sourceLines[0]!.id}\nSPEAKERS: ${JSON.stringify([
        ...new Set(sourceLines.map((l) => l.speakerHint).filter(Boolean)),
      ])}\nHEADING_LINES:\n${formatLines(headings)}\nPARTS:\n${JSON.stringify(parts)}`,
      schema: AnalyzeOutput,
      jsonSchema: AnalyzeOutputJsonSchema,
      name: "AnalyzeOutput",
      normalize,
      check,
      shouldStop: opts.shouldStop,
    });
  }

  const { assets, refToId } = buildAssets(out.assets, fixedAssets);
  const speakerMap: Record<string, string> = {};
  for (const m of out.speakerMap) {
    const id = refToId.get(m.assetRef);
    if (id) speakerMap[m.speakerHint] = id;
  }
  const index = new Map(sourceLines.map((l, i) => [l.id, i]));
  // Edge case "too few lines for the request": never fewer than MIN_LINES_PER_EPISODE lines each;
  // extra episodes are dropped by keeping evenly spaced starts from the model's plan.
  const cap = Math.max(1, Math.floor(sourceLines.length / MIN_LINES_PER_EPISODE));
  const proposed = out.episodePlan.episodes;
  const plan = proposed.length <= cap ? proposed : Array.from({ length: cap }, (_, i) => proposed[Math.round((i * proposed.length) / cap)]!);
  const episodes: Episode[] = plan.map((e, i) => {
    const next = plan[i + 1];
    const endIndex = next ? index.get(next.startLineId)! - 1 : sourceLines.length - 1;
    return {
      id: newId(),
      order: i + 1,
      title: e.title.slice(0, 120),
      targetFrames: settings.episodeSeconds * FPS,
      status: "pending",
      sourceLineRange: { from: e.startLineId, to: sourceLines[endIndex]!.id },
      segments: [],
    };
  });

  const doc: BreakdownDocument = {
    schemaVersion: 1,
    fps: FPS,
    aspectRatio: settings.aspectRatio,
    synopsis: {
      ...out.synopsis,
      characterProfiles: out.synopsis.characterProfiles.flatMap((p) => {
        const assetId = refToId.get(p.assetRef);
        return assetId ? [{ assetId, profile: p.profile }] : [];
      }),
    },
    assets,
    episodes,
  };
  return { doc, speakerMap, maxSensibleEpisodes: Math.min(out.episodePlan.maxSensibleEpisodes, episodes.length) };
}

// ---------------------------------------------------------------------------------------------
// Episode pass

/** Lines of the window after the last line the output used (they go to the next call). */
function uncoveredTail(out: EpisodeOutput, lines: SourceLine[]): SourceLine[] {
  const used = new Set(out.segments.flatMap((s) => s.shots.flatMap((h) => [...h.spokenLineIds, ...h.actionLineIds])));
  let last = -1;
  lines.forEach((l, i) => {
    if (used.has(l.id)) last = i;
  });
  return lines.slice(last + 1);
}

function episodeIssues(out: EpisodeOutput, window: SourceLine[], doc: BreakdownDocument): string[] {
  const issues: string[] = [];
  // A missing tail is fine (it is sent again in the next call); a gap is not.
  const tail = uncoveredTail(out, window);
  if (tail.length === window.length) issues.push(`No line was used; start with ${window[0]!.id}`);
  const lines = window.slice(0, window.length - tail.length);
  const lineIds = new Set(lines.map((l) => l.id));
  const hintOf = new Map(lines.map((l) => [l.id, l.hint]));
  const assetType = new Map(doc.assets.map((a) => [a.id, a.type]));
  const variantType = new Map(doc.assets.flatMap((a) => a.variants.map((v) => [v.id, a.type] as const)));
  const shots = out.segments.flatMap((s) => s.shots);

  const { missing, duplicated } = checkCoverage([...lineIds], shots);
  if (missing.length) issues.push(`These line ids are missing; put each in exactly one shot: ${missing.join(", ")}`);
  if (duplicated.length) issues.push(`These line ids are used more than once; keep each in one shot only: ${duplicated.join(", ")}`);
  const windowIds = new Set(window.map((l) => l.id));
  const unknown = shots.flatMap((s) => [...s.spokenLineIds, ...s.actionLineIds]).filter((id) => !windowIds.has(id));
  if (unknown.length) issues.push(`These line ids are not in this episode: ${[...new Set(unknown)].join(", ")}`);
  const dialogueAsAction = shots.flatMap((s) => s.actionLineIds).filter((id) => hintOf.get(id) === "dialogue");
  if (dialogueAsAction.length) {
    issues.push(`These are dialogue lines; move them from actionLineIds to spokenLineIds: ${dialogueAsAction.join(", ")}`);
  }

  out.segments.forEach((seg, si) => {
    const type = variantType.get(seg.settingVariantId);
    if (type !== "SETTING") {
      issues.push(`segments[${si}].settingVariantId "${seg.settingVariantId}" must be a variant id of a SETTING asset`);
    }
    seg.shots.forEach((shot, hi) => {
      const path = `segments[${si}].shots[${hi}]`;
      for (const id of extractMentionIds(shot.action)) {
        if (!variantType.has(id)) issues.push(`${path}.action mentions @{${id}}, which is not a variant id`);
      }
      const speakers = new Map(shot.speakerByLine.map((s) => [s.lineId, s.assetId]));
      for (const lineId of shot.spokenLineIds) {
        if (!speakers.has(lineId)) {
          issues.push(`${path}.speakerByLine has no entry for ${lineId}`);
          continue;
        }
        const assetId = speakers.get(lineId);
        if (assetId !== null && assetId !== undefined && assetType.get(assetId) !== "CHARACTER") {
          issues.push(`${path}: the speaker of ${lineId} must be a CHARACTER asset id or null`);
        } else if (assetId === null && hintOf.get(lineId) === "dialogue") {
          issues.push(`${path}: ${lineId} is dialogue, so its speaker must be a CHARACTER asset id`);
        }
      }
    });
  });
  return issues;
}

function toVisual(visual: EpisodeOutput["segments"][number]["shots"][number]["visual"]): ShotVisual {
  if (visual.kind !== "3d") return visual;
  let params: unknown;
  try {
    params = JSON.parse(visual.paramsJson);
  } catch {
    return { kind: "image", fallbackReason: "The 3D parameters were not valid JSON" };
  }
  const checked = Blender3dToolParams.safeParse({ tool: visual.tool, params });
  if (!checked.success) {
    return { kind: "image", fallbackReason: `The 3D tools cannot make this shot (${checked.error.issues[0]?.message ?? "invalid params"})` };
  }
  return { kind: "3d", tool: visual.tool, params: params as Record<string, unknown> };
}

/** Consecutive windows of about EPISODE_WINDOW_LINES lines, cut before a heading when possible. */
function lineWindows(lines: SourceLine[]): SourceLine[][] {
  const windows: SourceLine[][] = [];
  let current: SourceLine[] = [];
  for (const line of lines) {
    const full = current.length >= EPISODE_WINDOW_MAX;
    const atHeading = line.hint === "heading" && current.length >= EPISODE_WINDOW_LINES;
    if (current.length > 0 && (full || atHeading)) {
      windows.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) windows.push(current);
  // Fold a tiny last window into the previous one.
  if (windows.length > 1 && windows[windows.length - 1]!.length < EPISODE_WINDOW_LINES / 4) {
    const tail = windows.pop()!;
    windows[windows.length - 1]!.push(...tail);
  }
  return windows;
}

/**
 * Deterministic fixes before the checks:
 * - speakers the analyze pass already mapped (speakerHint → asset) win over the model's guess, and
 *   a CHARACTER variant id is read as its asset; only unnamed dialogue (dash lines) relies on the
 *   model;
 * - mentions written as `@id` (no braces) or with an asset id become `@{variantId}`, using the
 *   asset's first variant; a setting given as an asset id becomes its first variant, and an
 *   unknown setting falls back to the previous segment's;
 * - in a prose script (no dialogue and no headings anywhere) every line is narration (R2).
 */
function normalizeEpisode(
  out: EpisodeOutput,
  lines: SourceLine[],
  doc: BreakdownDocument,
  speakerMap: Record<string, string>,
  prose: boolean,
) {
  const hintOf = new Map(lines.map((l) => [l.id, l.speakerHint]));
  const ownerOfVariant = new Map(doc.assets.flatMap((a) => a.variants.map((v) => [v.id, a] as const)));
  const variantFor = (id: string) => (ownerOfVariant.has(id) ? id : doc.assets.find((a) => a.id === id)?.variants[0]?.id);
  // Each window line is used once: later repeats and ids outside the window are dropped.
  const seen = new Set<string>();
  const keep = (id: string) => {
    if (!hintOf.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  };
  for (const segment of out.segments) {
    for (const shot of segment.shots) {
      shot.spokenLineIds = shot.spokenLineIds.filter(keep);
      shot.actionLineIds = shot.actionLineIds.filter(keep);
    }
    segment.shots = segment.shots.filter((s) => s.spokenLineIds.length + s.actionLineIds.length > 0 || s.action.trim());
  }
  out.segments = out.segments.filter((s) => s.shots.length > 0);
  const settingVariants = doc.assets.filter((a) => a.type === "SETTING").flatMap((a) => a.variants.map((v) => v.id));
  let previousSetting = settingVariants[0];
  for (const segment of out.segments) {
    const id = variantFor(segment.settingVariantId);
    if (id !== undefined && ownerOfVariant.get(id)?.type === "SETTING") segment.settingVariantId = id;
    else if (previousSetting) segment.settingVariantId = previousSetting;
    previousSetting = segment.settingVariantId;
  }
  for (const shot of out.segments.flatMap((s) => s.shots)) {
    if (prose) {
      shot.spokenLineIds = [...shot.spokenLineIds, ...shot.actionLineIds];
      shot.actionLineIds = [];
    }
    shot.action = shot.action.replace(/@\{?([A-Za-z0-9_-]{12})\}?/g, (match, id: string) => {
      const variantId = variantFor(id);
      return variantId ? `@{${variantId}}` : match;
    });
    const given = new Map(shot.speakerByLine.map((s) => [s.lineId, s.assetId]));
    shot.speakerByLine = shot.spokenLineIds.map((lineId) => {
      if (prose) return { lineId, assetId: null };
      const hint = hintOf.get(lineId);
      const known = hint ? speakerMap[hint] : undefined;
      if (known) return { lineId, assetId: known };
      const assetId = given.get(lineId) ?? null;
      const owner = assetId ? ownerOfVariant.get(assetId) : undefined;
      return { lineId, assetId: owner?.type === "CHARACTER" ? owner.id : assetId };
    });
  }
  return out;
}

export async function runEpisode(opts: {
  doc: BreakdownDocument;
  episode: Episode;
  sourceLines: SourceLine[];
  speakerMap: Record<string, string>;
  shouldStop?: ShouldStop;
}): Promise<Episode> {
  const { doc, episode, speakerMap } = opts;
  const lines = linesInRange(opts.sourceLines, episode.sourceLineRange.from, episode.sourceLineRange.to);
  if (lines.length === 0) throw new BreakdownStepError(`Episode ${episode.order}: its line range is empty`);
  const targetSeconds = episode.targetFrames / FPS;
  const language = guessLanguage(lines.map((l) => l.text).join("\n"));
  const prose = opts.sourceLines.every((l) => l.hint === "action");

  const outputs: EpisodeOutput["segments"] = [];
  let remaining = lines;
  for (let call = 1; remaining.length > 0; call++) {
    const window = lineWindows(remaining)[0]!;
    const formatted = window
      .map((l) => {
        const id = l.speakerHint ? speakerMap[l.speakerHint] : undefined;
        const speaker = l.speakerHint ? ` speaker=${l.speakerHint}${id ? ` id=${id}` : ""}` : "";
        return `${l.id} [${l.hint}${speaker}] ${l.text}`;
      })
      .join("\n");
    const windowSeconds = Math.max(4, Math.round((targetSeconds * window.length) / lines.length));
    const done = lines.length - remaining.length;
    const part = window.length < lines.length ? ` (lines ${done + 1}–${done + window.length} of ${lines.length})` : "";
    const out = await callStructured({
      step: `Episode ${episode.order}${part}`,
      system: episodeSystemPrompt(windowSeconds),
      user: `${formatAssetTable(doc)}\nTARGET_SECONDS: ${windowSeconds}${language ? `\nLANGUAGE: write action and sound in ${language}` : ""}\nLINES:\n${formatted}`,
      schema: EpisodeOutput,
      jsonSchema: EpisodeOutputJsonSchema,
      name: "EpisodeOutput",
      normalize: (o) => normalizeEpisode(o, window, doc, speakerMap, prose),
      check: (o) => episodeIssues(o, window, doc),
      shouldStop: opts.shouldStop,
    });
    outputs.push(...out.segments);
    remaining = [...uncoveredTail(out, window), ...remaining.slice(window.length)];
    if (call > lines.length) throw new BreakdownStepError(`Episode ${episode.order}: the AI made no progress`);
  }

  const textOf = new Map(lines.map((l) => [l.id, l.text]));
  const segments: Segment[] = outputs.map((seg, si) => ({
    id: newId(),
    order: si + 1,
    settingVariantId: seg.settingVariantId,
    durationInFrames: 0,
    shots: seg.shots.map((shot, hi): Shot => {
      const speakers = new Map(shot.speakerByLine.map((s) => [s.lineId, s.assetId]));
      return {
        id: newId(),
        order: hi + 1,
        durationInFrames: secondsToFrames(shot.suggestedSeconds),
        shotSize: shot.shotSize,
        camera: shot.camera.slice(0, 120),
        action: shot.action.slice(0, 1000),
        // Spoken text is copied from the source line, never from the model (R1, FR-010).
        lines: shot.spokenLineIds.map((lineId) => {
          const speakerAssetId = speakers.get(lineId) ?? null;
          return {
            id: newId(),
            kind: speakerAssetId ? ("dialogue" as const) : ("narration" as const),
            speakerAssetId,
            text: textOf.get(lineId)!,
            sourceLineId: lineId,
          };
        }),
        sound: shot.sound.slice(0, 200),
        visual: toVisual(shot.visual),
      };
    }),
  }));

  const fitted = fitDurations({ ...episode, segments }, episode.targetFrames);
  return { ...fitted, status: "done", error: undefined };
}
