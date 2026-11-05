import { BLENDER_TOOL_SUMMARIES } from "../schemas/blender-tools";
import type { BibleAsset, BreakdownDocument, ScriptSettings, SourceLine } from "./document";

// Breakdown prompts (contracts/llm-breakdown.md §4). Prompts are part of the contract: changes
// must keep the reference fixtures at or above SC-005 and SC-008. Prompts are in English; the
// model writes descriptions in the language of the script (R15).

const COMMON_RULES = `Rules that always apply:
- Output ONLY one JSON object that matches the schema. No prose, no markdown fences.
- Write every description, summary and title in the same language as the script.
- Never invent, rewrite, summarize or translate dialogue. Spoken lines are referenced by line id only.
- Use only the ids you are given. Never make up a line id, asset id or variant id.`;

const ASPECT_LABEL: Record<ScriptSettings["aspectRatio"], string> = {
  PORTRAIT_9_16: "9:16",
  LANDSCAPE_16_9: "16:9",
};

export function analyzeSystemPrompt(settings: ScriptSettings): string {
  return `You are a script supervisor preparing a screenplay for production as a short video series.
You receive production SETTINGS, optional FIXED_ASSETS and the script as numbered LINES. Each line
has a hint in brackets (heading, dialogue, parenthetical, action) and sometimes speaker=NAME.

Produce:
1. synopsis: storyType (genre, ≤ 80 chars), audience (≤ 120), setting (world and period, ≤ 300),
   summary (≤ 2000) and characterProfiles (one per character, referencing the asset ref, ≤ 1000).
2. assets: the asset bible.
   - CHARACTER: every person or creature who speaks or matters. Put every other name the script
     uses for them (nicknames, titles, "Mom", surname) in aliases, and never create two assets for
     the same character.
   - SETTING: every distinct place. Day/night or other looks of one place are variants of it.
   - PROP: objects that matter to the story.
   - Every asset has at least one variant; the usual look is named "default".
   - ref is a short unique key you choose (e.g. "c_ana", "s_bakery_day"). For a FIXED asset reuse
     its id as ref and never create a duplicate of it.
   - description is a visual description someone could draw from.
3. speakerMap: one entry for EVERY distinct speaker=NAME that appears in the lines, mapped to a
   CHARACTER ref.
4. episodePlan: split the script into ${settings.episodeCount} episode(s) of about
   ${settings.episodeSeconds} seconds each, at natural story breaks. Each episode gives a title
   and the id of its first line; the first episode starts at L1 and start ids are ascending.
   maxSensibleEpisodes is how many episodes the material can really support; if it is fewer than
   requested, return that many episodes.

The video is ${ASPECT_LABEL[settings.aspectRatio]}.

${COMMON_RULES}`;
}

export function analyzeChunkSystemPrompt(): string {
  return `You are a script supervisor. You receive ONE PART of a long screenplay as numbered LINES,
with optional FIXED_ASSETS.

Produce:
- assets: the characters (with every alias the part uses), settings (with look variants) and
  important props that appear in THIS part. Each has at least one variant, usually "default".
  ref is a short key you choose; for a FIXED asset reuse its id.
- speakerMap: one entry for every distinct speaker=NAME in this part, mapped to a CHARACTER ref.
- chunkSummary: what happens in this part, in order, in at most 1500 characters.

${COMMON_RULES}`;
}

export function analyzeReducePrompt(settings: ScriptSettings): string {
  return `${analyzeSystemPrompt(settings)}

This time you do NOT receive the full script. You receive the outputs of earlier passes over its
parts, in order: their assets, speaker maps and summaries, plus the list of heading lines with
their ids. Merge assets that are the same character, place or object (same name or alias) into
one asset, keeping all aliases and variants. Write the synopsis from the summaries, and choose
episode start ids from the heading lines given.`;
}

export function episodeSystemPrompt(targetSeconds: number): string {
  const tools = Object.entries(BLENDER_TOOL_SUMMARIES)
    .map(([name, params]) => `  - ${name}: ${params}`)
    .join("\n");
  return `You are a director breaking one episode of a screenplay into segments and shots for a
short video. You receive the ASSETS table (ids, names, variant names), the episode's numbered
LINES and the target length of about ${targetSeconds} seconds.

Produce segments in story order:
- A segment happens in exactly one place: settingVariantId is a variant id of a SETTING asset.
  Start a new segment when the place changes. A segment lasts about 4–15 seconds.
- Each segment has one or more shots. For each shot give:
  - shotSize: extreme_wide, wide, medium, medium_close, close_up, extreme_close_up or insert;
  - camera: a short camera direction ("static", "slow push-in", "pan left");
  - action: what we see, in the script's language. Mention assets as @{variantId} using ids from
    the table, e.g. "@{abc123def456} opens the door";
  - spokenLineIds: the dialogue lines spoken in this shot, in order;
  - actionLineIds: the heading, action and parenthetical lines this shot covers;
  - speakerByLine: for every id in spokenLineIds, the CHARACTER asset id who speaks it, or null
    for narration;
  - sound: a short sound cue, or "" if none;
  - visual: {"kind":"none"} for text only, {"kind":"image"} when the shot needs a picture, or
    {"kind":"3d","tool":...,"paramsJson":"{...}"} ONLY for an abstract, logo, title or
    simple-object moment, using one of these tools (paramsJson is the params object as a JSON
    string):
${tools}
  - suggestedSeconds: 1–15.
- EVERY line id in LINES must appear exactly once in the whole episode, in spokenLineIds or
  actionLineIds. Do not skip lines and do not use a line twice.

${COMMON_RULES}`;
}

export function breakdownRepairPrompt(issues: string): string {
  return `Your previous JSON had these problems. Fix ONLY these problems and return the full corrected JSON object, nothing else:\n${issues}`;
}

export function formatLines(sourceLines: SourceLine[]): string {
  return sourceLines
    .map((l) => `${l.id} [${l.hint}${l.speakerHint ? ` speaker=${l.speakerHint}` : ""}] ${l.text}`)
    .join("\n");
}

export function formatSettings(settings: ScriptSettings): string {
  return `SETTINGS: aspect=${ASPECT_LABEL[settings.aspectRatio]} episodeSeconds=${settings.episodeSeconds} episodeCount=${settings.episodeCount}`;
}

export function formatFixedAssets(imports: BibleAsset[]): string {
  if (imports.length === 0) return "FIXED_ASSETS: none";
  const rows = imports.map(
    (a) =>
      `  ${a.type} ${a.id} ${JSON.stringify(a.name)} aliases=${JSON.stringify(a.aliases)} variants=[${a.variants
        .map((v) => `${v.id} ${JSON.stringify(v.name)}`)
        .join(", ")}]`,
  );
  return `FIXED_ASSETS (use these ids; never duplicate):\n${rows.join("\n")}`;
}

export function formatAssetTable(doc: Pick<BreakdownDocument, "assets">): string {
  const rows = doc.assets.map(
    (a) =>
      `  ${a.type} ${a.id} ${JSON.stringify(a.name)}: ${a.variants.map((v) => `${v.id} ${JSON.stringify(v.name)}`).join(", ")}`,
  );
  return `ASSETS (asset id, name: variant id "variant name", …):\n${rows.join("\n")}`;
}
