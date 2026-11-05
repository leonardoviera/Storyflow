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
} from "../breakdown/prompts";
import { Blender3dToolParams } from "../schemas/blender-tools";
import { llm } from "./client";
import { withLlmSlot } from "./slot";

// Breakdown passes (R3, contracts/llm-breakdown.md): one analyze pass (map-reduce for long
// scripts), then one episode pass per episode. Every call is structured, strict, serialized by
// withLlmSlot and gets up to 2 repair rounds for schema and semantic problems (R6).

export class BreakdownStepError extends Error {}

const MAX_REPAIRS = 2;
const MAP_REDUCE_TOKENS = 16_000;
const CHUNK_TOKENS = 12_000;
const MODEL = "local-llm";

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
  check?: (out: z.infer<S>) => string[];
}): Promise<z.infer<S>> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.user },
  ];
  let issues: string[] = [];
  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    const completion = await withLlmSlot(() =>
      llm().chat.completions.create({
        model: MODEL,
        messages,
        temperature: 0.2,
        response_format: { type: "json_schema", json_schema: { name: opts.name, schema: opts.jsonSchema, strict: true } },
      }),
    );
    const content = completion.choices[0]?.message?.content ?? "";
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
        issues = opts.check?.(parsed.data) ?? [];
        if (issues.length === 0) return parsed.data;
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

  for (const incoming of llmAssets) {
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
}): Promise<AnalyzeResult> {
  const { sourceLines, settings, fixedAssets } = opts;
  if (sourceLines.length === 0) throw new BreakdownStepError("The script is empty");
  const header = `${formatSettings(settings)}\n${formatFixedAssets(fixedAssets)}`;
  const check = (out: AnalyzeOutput) => analyzeIssues(out, sourceLines, fixedAssets);

  let out: AnalyzeOutput;
  if (estimateTokens(formatLines(sourceLines)) <= MAP_REDUCE_TOKENS) {
    out = await callStructured({
      step: "Analysis",
      system: analyzeSystemPrompt(settings),
      user: `${header}\nLINES:\n${formatLines(sourceLines)}`,
      schema: AnalyzeOutput,
      jsonSchema: AnalyzeOutputJsonSchema,
      name: "AnalyzeOutput",
      check,
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
      check,
    });
  }

  const { assets, refToId } = buildAssets(out.assets, fixedAssets);
  const speakerMap: Record<string, string> = {};
  for (const m of out.speakerMap) {
    const id = refToId.get(m.assetRef);
    if (id) speakerMap[m.speakerHint] = id;
  }
  const index = new Map(sourceLines.map((l, i) => [l.id, i]));
  const plan = out.episodePlan.episodes;
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
  return { doc, speakerMap, maxSensibleEpisodes: out.episodePlan.maxSensibleEpisodes };
}

// ---------------------------------------------------------------------------------------------
// Episode pass

function episodeIssues(out: EpisodeOutput, lines: SourceLine[], doc: BreakdownDocument): string[] {
  const issues: string[] = [];
  const lineIds = new Set(lines.map((l) => l.id));
  const hintOf = new Map(lines.map((l) => [l.id, l.hint]));
  const assetType = new Map(doc.assets.map((a) => [a.id, a.type]));
  const variantType = new Map(doc.assets.flatMap((a) => a.variants.map((v) => [v.id, a.type] as const)));
  const shots = out.segments.flatMap((s) => s.shots);

  const { missing, duplicated } = checkCoverage([...lineIds], shots);
  if (missing.length) issues.push(`These line ids are missing; put each in exactly one shot: ${missing.join(", ")}`);
  if (duplicated.length) issues.push(`These line ids are used more than once; keep each in one shot only: ${duplicated.join(", ")}`);
  const unknown = shots.flatMap((s) => [...s.spokenLineIds, ...s.actionLineIds]).filter((id) => !lineIds.has(id));
  if (unknown.length) issues.push(`These line ids are not in this episode: ${[...new Set(unknown)].join(", ")}`);

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

export async function runEpisode(opts: {
  doc: BreakdownDocument;
  episode: Episode;
  sourceLines: SourceLine[];
  speakerMap: Record<string, string>;
}): Promise<Episode> {
  const { doc, episode, speakerMap } = opts;
  const lines = linesInRange(opts.sourceLines, episode.sourceLineRange.from, episode.sourceLineRange.to);
  if (lines.length === 0) throw new BreakdownStepError(`Episode ${episode.order}: its line range is empty`);
  const formatted = lines
    .map((l) => {
      const speaker = l.speakerHint ? ` speaker=${l.speakerHint}${speakerMap[l.speakerHint] ? ` id=${speakerMap[l.speakerHint]}` : ""}` : "";
      return `${l.id} [${l.hint}${speaker}] ${l.text}`;
    })
    .join("\n");
  const targetSeconds = Math.round(episode.targetFrames / FPS);

  const out = await callStructured({
    step: `Episode ${episode.order}`,
    system: episodeSystemPrompt(targetSeconds),
    user: `${formatAssetTable(doc)}\nTARGET_SECONDS: ${targetSeconds}\nLINES:\n${formatted}`,
    schema: EpisodeOutput,
    jsonSchema: EpisodeOutputJsonSchema,
    name: "EpisodeOutput",
    check: (o) => episodeIssues(o, lines, doc),
  });

  const textOf = new Map(lines.map((l) => [l.id, l.text]));
  const segments: Segment[] = out.segments.map((seg, si) => ({
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
