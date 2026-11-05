# Contract: LLM structured outputs for script writing and breakdown

Every call goes through LiteLLM with the alias `local-llm` and runs inside `withLlmSlot()`, so at
most one request is in flight (constitution III, FR-032). Structured calls use `response_format:
{ type: "json_schema", strict: true }`. The schemas are generated from Zod
(`packages/shared/src/breakdown/llm-schemas.ts`), and Zod is authoritative. A call gets up to 2
repair rounds (research R6).

## 1. `script.write`: idea → script text (US2)

- **Output**: plain text, not JSON. The system prompt asks for a screenplay with:
  - scene headings (`INT./EXT. PLACE — TIME`);
  - action lines;
  - `NAME: dialogue` lines.

  This is the format the parser (R2) reads best.
- **Length guide**: about 150 spoken words per minute × `episodeSeconds` × `episodeCount`, ±20%.
- **Language**: the same as the idea (R15).
- **Validation**:
  - the text must be non-empty, under 50,000 words, and contain at least one heading or action
    line;
  - if not, one repair round runs.
- **Result**: the text is saved to `ProjectScript.text` with `origin = GENERATED` and `idea` set.

## 2. Analyze pass → `AnalyzeOutput`

**Input** (user message): the settings, any library imports as fixed assets, and the numbered
lines:

```text
SETTINGS: aspect=9:16 episodeSeconds=60 episodeCount=2
FIXED_ASSETS (use these ids; never duplicate):
  CHARACTER lib_ana "Ana Lima" aliases=["Ana","Dra. Lima"] variants=[v_ana_def "default"]
LINES:
L1 [heading] INT. PADARIA — DIA
L2 [action] Ana entra apressada, molhada de chuva.
L3 [dialogue speaker=ANA] Bom dia! Ainda tem pão de queijo?
…
```

**Output**:

```ts
AnalyzeOutput {
  synopsis: {
    storyType: string; audience: string; setting: string; summary: string;
    characterProfiles: { assetRef: string; profile: string }[]
  }
  assets: {
    ref: string                       // model-chosen key, or a FIXED id
    type: "CHARACTER" | "SETTING" | "PROP"
    name: string; aliases: string[]; description: string
    variants: { ref: string; name: string; description: string }[]   // ≥ 1
  }[]
  speakerMap: { speakerHint: string; assetRef: string }[]   // every distinct speakerHint
  episodePlan: {
    maxSensibleEpisodes: number       // edge case: too few lines for the request
    episodes: { title: string; startLineId: string }[]   // first starts at L1; ascending
  }
}
```

**Server post-processing**:
- `ref`s are replaced by real ids, and FIXED ids are kept.
- Aliases are merged when two assets of the same type share a name or alias (FR-015).
- Each episode's `sourceLineRange` is set from consecutive `startLineId`s.
- If `episodes.length` < the requested count, the job keeps going with the model's number and
  records the `maxSensibleEpisodes` explanation. The UI then offers to accept it or change it.

**Semantic repair triggers**:
- `startLineId` values that are unknown or not ascending;
- a `speakerHint` with no mapping;
- an asset with zero variants.

**Map-reduce mode** (more than 16k estimated tokens, R3):
- each chunk returns `{ assets, speakerMap, chunkSummary: string (≤ 1,500) }`;
- the reduce call takes all chunk outputs and returns the full `AnalyzeOutput`.

## 3. Episode pass → `EpisodeOutput` (once per episode)

**Input**:
- the asset table, as ids, names and variant names only;
- the episode's numbered lines, with kinds already confirmed through `speakerMap`;
- `targetSeconds`;
- the supported 3D tools with short parameter summaries (`BLENDER_TOOL_SUMMARIES`), which say a
  3D visual is only for abstract, logo, title or simple-object moments.

**Output**:

```ts
EpisodeOutput {
  segments: {
    settingVariantId: string          // must be a SETTING variant id from the table
    shots: {
      shotSize: "extreme_wide"|"wide"|"medium"|"medium_close"|"close_up"|"extreme_close_up"|"insert"
      camera: string
      action: string                  // may include @{variantId}
      spokenLineIds: string[]         // dialogue/narration lines, in order
      actionLineIds: string[]         // heading/action/parenthetical lines this shot covers
      speakerByLine: { lineId: string; assetId: string | null }[]   // null = narration
      sound: string
      visual: { kind: "none" } | { kind: "image" } | { kind: "3d"; tool: string; params: object }
      suggestedSeconds: number        // 1–15
    }[]
  }[]
}
```

**Server checks** (the repair triggers, R1/R6):
1. **Coverage**: every line id in the range appears exactly once across all shots' `spokenLineIds`
   ∪ `actionLineIds`. The repair prompt lists the missing and duplicated ids.
2. Every `settingVariantId` and every mention token resolves to the right asset type.
3. Every spoken line has a `speakerByLine` entry. A dialogue line must have a CHARACTER.
4. 3D visuals must pass `Blender3dToolParams`. If they don't, the shot is **downgraded** to `{
   kind: "image", fallbackReason }` without a repair.

**Then**:
- the spoken text is copied from `SourceLine.text`, verbatim (FR-010);
- `fitDurations` (R4) sets every `durationInFrames`;
- the episode is written into the document with `status = "done"`.

## 4. Prompts

Prompts live in `packages/shared/src/breakdown/prompts.ts`. All of them say:
- output only JSON that matches the schema;
- write descriptions in the source language;
- never invent dialogue;
- use only the given ids.

Prompts are part of the contract. Changes must keep the fixture set
(`tests/fixtures/scripts/`, research R14) at or above SC-005 and SC-008.
