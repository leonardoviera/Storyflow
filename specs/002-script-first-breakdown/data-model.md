# Data Model: Script-First Project Creation and Breakdown

**Feature**: `002-script-first-breakdown` | **Plan**: [plan.md](./plan.md) |
**Research**: [research.md](./research.md)

This feature builds on the 001 schema (`packages/db/prisma/schema.prisma`). It adds 4 tables, 2
enums, enum values and a few columns. The breakdown content itself is a validated JSON document
(R5), described in the second half of this file.

## 1. Relational changes (Prisma)

### Enum additions

```prisma
enum ProjectKind  { STANDARD EPISODE }                     // new
enum ScriptOrigin { PASTE UPLOAD GENERATED }               // new
enum BreakdownStatus { RUNNING READY PARTIAL FAILED CANCELLED }  // new
enum AspectRatio  { PORTRAIT_9_16 LANDSCAPE_16_9 }         // new
enum BibleAssetType { CHARACTER SETTING PROP }             // new (LibraryAsset.type)

enum JobType   { SCRIPT_GENERATION ASSET_3D VIDEO_RENDER SCRIPT_WRITE BREAKDOWN }  // + 2
enum AssetKind { IMAGE VIDEO AUDIO MODEL_3D RENDER_3D FONT FINAL_RENDER DOCUMENT } // + DOCUMENT
```

### `Project` (changed)

| Field | Type | Notes |
|---|---|---|
| `kind` | `ProjectKind` default `STANDARD` | `EPISODE` = child timeline built from a breakdown (R9) |
| `parentProjectId` | `String?` → `Project` (Cascade) | Set only when `kind = EPISODE` |
| `episodeKey` | `String?` | Episode id inside the parent's current breakdown document |
| `builtRevision` | `Int?` | `timelineRevision` right after the last build; `timelineRevision > builtRevision` ⇒ hand edits (FR-027) |
| `currentBreakdownId` | `String? @unique` → `Breakdown` (SetNull) | The breakdown version shown on the review screen |

Constraints:
- `@@unique([parentProjectId, episodeKey])`: one child per episode.
- `@@index([kind, archivedAt, updatedAt])`: the home page lists `STANDARD` projects only.
- Asset lookup for an `EPISODE` project includes the parent's assets (R9).

### `ProjectScript` (new, 1:1 with a STANDARD project)

| Field | Type | Rules |
|---|---|---|
| `id` | `String @id` | |
| `projectId` | `String @unique` → `Project` (Cascade) | |
| `text` | `String` | ≤ 50,000 words (FR-002); saved on every edit (FR-005) |
| `origin` | `ScriptOrigin` | PASTE / UPLOAD / GENERATED |
| `sourceAssetId` | `String?` → `Asset` (SetNull) | Original uploaded file (`DOCUMENT`) |
| `idea` | `String?` | ≤ 4,000 chars, the prompt used for GENERATED (FR-003) |
| `aspectRatio` | `AspectRatio` default `PORTRAIT_9_16` | FR-004 |
| `episodeSeconds` | `Int` default 60 | 15–300 (FR-004) |
| `episodeCount` | `Int` default 1 | 1–20 (FR-004) |
| `libraryImports` | `Json` default `[]` | `BibleAsset[]` copied from the library before a breakdown (R10) |
| `revision` | `Int` default 0 | Optimistic lock for autosave |
| `updatedAt` | `DateTime @updatedAt` | |

### `Breakdown` (new: one numbered run, FR-012)

| Field | Type | Rules |
|---|---|---|
| `id` | `String @id` | |
| `projectId` | `String` → `Project` (Cascade) | |
| `version` | `Int` | `@@unique([projectId, version])`, starting at 1 |
| `status` | `BreakdownStatus` | See the state machine below |
| `sourceText` | `String` | Script snapshot at start, so later script edits don't change this version |
| `sourceLines` | `Json` | `SourceLine[]` from the parser (R2) |
| `settings` | `Json` | `{ aspectRatio, episodeSeconds, episodeCount, fps: 30 }` snapshot. After the analyze pass the worker adds `analysis: { speakerMap, maxSensibleEpisodes }`, which episode retries and the review screen read |
| `document` | `Json` | `BreakdownDocument` (§2), validated on every write |
| `revision` | `Int` default 0 | Optimistic lock for review autosave (FR-021) |
| `jobId` | `String?` → `Job` (SetNull) | Last breakdown job for this version |
| `createdAt` / `updatedAt` | `DateTime` | |

**State machine**

```text
RUNNING ──(all episodes done)──────────────▶ READY
RUNNING ──(≥1 episode failed, others done)─▶ PARTIAL ──(retry ok)──▶ READY
RUNNING ──(analyze pass failed)────────────▶ FAILED
RUNNING ──(job cancelled)──────────────────▶ CANCELLED   (finished episodes kept)
PARTIAL/CANCELLED ──(retry episodes)───────▶ RUNNING
```

While the status is `RUNNING`, `PUT …/breakdowns/{version}` returns `409 BREAKDOWN_RUNNING`. The
review screen is read-only during that time (R7).

### `TimelineSnapshot` (new, FR-027)

| Field | Type | Rules |
|---|---|---|
| `id` | `String @id` | |
| `projectId` | `String` → `Project` (Cascade) | The episode project |
| `timelineRevision` | `Int` | Revision copied |
| `tracks` | `Json` | `TimelineWrite["tracks"]` shape (001), restorable through `putTimeline` |
| `reason` | `String` | `"rebuild"` or `"restore"` |
| `createdAt` | `DateTime` | |

Retention: the last 10 snapshots per project.

### `LibraryAsset` (new, FR-029/030)

| Field | Type | Rules |
|---|---|---|
| `id` | `String @id` | |
| `type` | `BibleAssetType` (`CHARACTER`/`SETTING`/`PROP`) | Prisma enum |
| `name` | `String @db.VarChar(80)` | `@@unique([type, name])` |
| `aliases` | `String[]` | ≤ 10, each ≤ 80 chars |
| `description` | `String` | ≤ 2,000 chars |
| `variants` | `Json` | `BibleVariant[]` (§2), ≥ 1 |
| `createdAt` / `updatedAt` | `DateTime` | |

Reference images are `Asset` rows with `projectId = null` and kind `IMAGE`. They are referenced by
id from `variants[].referenceAssetIds`.

## 2. `BreakdownDocument` (JSONB, Zod in `packages/shared/src/breakdown/document.ts`)

All `id`s are server-generated, 12-character URL-safe strings, unique within the document.
Durations are **integer frames at `fps` (30)** (R4).

```ts
BreakdownDocument {
  schemaVersion: 1
  fps: 30
  aspectRatio: "PORTRAIT_9_16" | "LANDSCAPE_16_9"
  synopsis: Synopsis
  assets: BibleAsset[]                 // characters, settings, props
  episodes: Episode[]                  // ordered
}

Synopsis {
  storyType: string (≤ 80)             // e.g. "romantic drama"
  audience: string (≤ 120)
  setting: string (≤ 300)              // world and period
  summary: string (≤ 2,000)
  characterProfiles: { assetId: string, profile: string (≤ 1,000) }[]
}

BibleAsset {
  id: string
  type: "CHARACTER" | "SETTING" | "PROP"
  name: string (1–80)                  // unique per type (case-insensitive)
  aliases: string[] (≤ 10)             // "Dr. Lima", "Mom" … (FR-015)
  description: string (≤ 2,000)
  libraryAssetId?: string              // set when imported from the library (FR-030)
  variants: BibleVariant[] (≥ 1)
}

BibleVariant {
  id: string                           // mention target (FR-014)
  name: string (1–60)                  // unique within its asset; default "default"
  description: string (≤ 1,000)
  referenceAssetIds: string[] (≤ 8)    // Asset ids, kind IMAGE (FR-016)
}

Episode {
  id: string
  order: number                        // 1-based
  title: string (≤ 120)
  targetFrames: number                 // episodeSeconds × fps
  status: "pending" | "running" | "done" | "failed"
  error?: string                       // readable reason when failed
  lengthWarning?: boolean              // |actual − target| > 20 % (FR-019)
  sourceLineRange: { from: string, to: string }   // SourceLine ids
  segments: Segment[]
}

Segment {
  id: string
  order: number
  settingVariantId: string             // exactly one setting (FR-008); must be a SETTING variant
  durationInFrames: number             // = Σ shots; 120–450 at 30 fps (4–15 s)
  shots: Shot[] (≥ 1)
}

Shot {
  id: string
  order: number
  durationInFrames: number             // ≥ 30 (1 s)
  shotSize: "extreme_wide" | "wide" | "medium" | "medium_close" | "close_up" | "extreme_close_up" | "insert"
  camera: string (≤ 120)               // "static", "slow push-in", "pan left" …
  action: string (≤ 1,000)             // may contain @{variantId} tokens
  lines: SpokenLine[]                  // dialogue / narration in order
  sound: string (≤ 200)
  visual: ShotVisual
  continued?: boolean                  // created by the fitter splitting a long shot (R4)
}

SpokenLine {
  id: string
  kind: "dialogue" | "narration"
  speakerAssetId: string | null        // CHARACTER asset; null for narration
  text: string (≤ 2,000)               // copied from source (R1); creator may edit
  sourceLineId?: string                // present ⇒ verbatim check applies while text unchanged
}

ShotVisual =
  | { kind: "none" }                                   // text only
  | { kind: "image", fallbackReason?: string }         // placeholder at build time
  | { kind: "3d", tool: BlenderToolName, params: object }   // must pass Blender3dToolParams
```

### `SourceLine` (stored in `Breakdown.sourceLines`)

```ts
SourceLine { id: "L1"…"Ln", text: string, hint: "heading"|"dialogue"|"parenthetical"|"action", speakerHint?: string }
```

### Validation (`checkBreakdown(doc, sourceLines)`: pure, shared by UI and API)

**Hard errors.** The PUT is rejected with 422 if any of these hold:
- the document fails the schema;
- ids are duplicated;
- a `settingVariantId` points to a variant that is not a SETTING;
- `speakerAssetId` is not a CHARACTER;
- names are duplicated within a type, or variant names within an asset;
- an episode or segment `durationInFrames` is not the sum of its children.

**Flags.** These are saved, shown on the item and block only the timeline build (FR-019, FR-023):

| Flag | Rule | Blocks build? |
|---|---|---|
| `SEGMENT_DURATION` | segment < 120 or > 450 frames | no |
| `SHOT_TOO_SHORT` | shot < 30 frames | no |
| `MISSING_MENTION` | `@{id}` token or label that resolves to no variant | **yes** |
| `MISSING_SPEAKER` | `speakerAssetId` set but asset deleted | **yes** |
| `EPISODE_LENGTH` | \|Σ segments − targetFrames\| > 20 % of target | no |
| `VERBATIM_DRIFT` | info only: `sourceLineId` set and text ≠ source (creator edited) | no |

Every flag carries a JSON path to the exact item, e.g. `episodes[1].segments[3].shots[0]`.

### Mutations and their invariants

| Operation | Effect |
|---|---|
| Rename asset or variant | Only the record changes; mentions are tokens, so every shot shows the new name (FR-014) |
| Delete asset or variant | The API caller must send `confirmMentions = n`, where n = count of shots referencing it (FR-020). The tokens stay and become `MISSING_MENTION` flags |
| Split shot | Two shots; lines divided at an index; durations split so the segment total is kept |
| Merge segments | Allowed only if both have the same `settingVariantId`, or the creator picks one; shots concatenated |
| Move shot | Segment totals recomputed; the validator flags any segment outside 4–15 s |
| Rebalance (optional) | Runs `fitDurations` on one episode (R4) |

## 3. Child project and timeline mapping (R9, R12)

```text
Project (STANDARD) ──1:1── ProjectScript
      │ currentBreakdownId
      ├──1:N── Breakdown (version 1..n) ── document.episodes[*].id
      │                                           │ episodeKey
      └──1:N── Project (EPISODE, parentProjectId) ─┘ ── Track/Clip (001) ── TimelineSnapshot
```

The episode project's tracks are created by `buildEpisodeTimeline`:

| Track (001 `TrackKind`) | Clip per | `assetId` | `props` |
|---|---|---|---|
| VISUAL | shot with `visual.kind = image` | reference image if the setting variant has one, else `null` | `placeholder: { shotId, label }` when null |
| OVERLAY_3D | shot with `visual.kind = 3d` | new `RENDER_3D` asset (PENDING → READY via `asset3d.render`) | — |
| TEXT | spoken line (split at 200 chars) | `null` | `text`, lower-third `transform`, `background` |

`Clip.sceneId` stays `null`. Clips record their source shot in `props.placeholder.shotId`, or in
`props.shotId` for TEXT and 3D clips. That is a new optional `ClipProps` field; see
[contracts/composition-props-delta.md](./contracts/composition-props-delta.md).
