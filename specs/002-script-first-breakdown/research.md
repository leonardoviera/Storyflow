# Research: Script-First Project Creation and Breakdown

**Feature**: `002-script-first-breakdown` | **Date**: 2026-11-04 | **Plan**: [plan.md](./plan.md)

Phase 0 decisions. Each one gives the decision, the reason and what else was considered. Decisions
from feature 001 (`specs/001-local-video-platform/research.md`) still apply unless one below
replaces it.

---

## R1. How dialogue stays verbatim (FR-010, SC-003)

**Decision**: The model never retypes spoken text. Before any model call, the server splits the
script into numbered **source lines** (`L1…Ln`) with a deterministic parser (R2). The model's
episode output refers to lines **by id** (`spokenLineIds`, `actionLineIds`). The server then copies
the original text into each shot. After every episode pass, a coverage check makes sure every line
in that episode's range is used **exactly once**: once as spoken text, or once as an action or
heading line. Missing or duplicated ids go back to the model in a repair prompt (R6).

**Rationale**: SC-003 asks for 100% verbatim dialogue. A 20B model asked to copy dialogue will
sometimes paraphrase, translate or fix typos. Ids make verbatim text true by construction rather
than something we hope for. The coverage check is the automatic SC-003 test, and it runs on every
breakdown, not only in validation.

**Alternatives considered**:
- Asking the model to copy the text and diffing afterwards. This finds errors but does not stop
  them, so it costs extra repair rounds.
- Splitting one line across several shots by character ranges. This is not needed: the spec says
  every line appears in exactly one shot, and one shot can hold several lines.

## R2. Script parsing into source lines

**Decision**: A pure TypeScript parser in `packages/shared/src/breakdown/parse-script.ts`. It
normalizes line endings, drops blank lines and gives each remaining line a stable id and a
**hint kind**:
- `heading`: `INT.`/`EXT.`/`INT./EXT.`, Portuguese `INT`/`EXT`/`CENA n`, Markdown `#` headings;
- `dialogue`, with a speaker hint, in four forms:
  - `NAME: text`;
  - Fountain-style uppercase character line, with the next line as the dialogue;
  - dash dialogue (`— text` / `- text`);
  - quoted lines that carry a speech verb;
- `parenthetical`: `(…)` lines;
- `action`: everything else.

The model gets the numbered lines with these hints. It confirms or fixes the kind and maps the
speaker hint to a character asset. When the speaker sits on its own line (Fountain), that line is
folded into the dialogue line's `speakerHint` and is not its own source line.

**Rationale**: The hints let the model do classification, which it is good at, instead of
transcription. Scripts that are prose with no formatting still work: everything is `action` or
`narration`, which matches the "script without dialogue" edge case.

**Alternatives considered**: A full Fountain parser library. Scripts in this app are mostly
informal, often Portuguese, and seldom real Fountain. A small parser that we own and test is
safer.

## R3. Breakdown pipeline: passes and model calls

**Decision**: There are two kinds of passes, run as one background job per breakdown (R7):

1. **Analyze pass** (one call, or map-reduce for long scripts). The input is all numbered lines
   plus the production settings and any imported library assets. The output follows
   `AnalyzeOutput` ([contracts/llm-breakdown.md](./contracts/llm-breakdown.md)):
   - the synopsis;
   - the asset bible: characters with aliases and variants, settings with variants, props;
   - the **episode plan**: the start line id of each episode, plus a `maxSensibleEpisodes`
     estimate.
2. **Episode pass** (one call per episode, in order). The input is the bible as a compact id
   table, the episode's line range and its target length. The output follows `EpisodeOutput`:
   segments, each with a setting variant id, then shots. Each shot has the shot size, camera,
   action text with `@{variantId}` mentions, `spokenLineIds` with a speaker asset id,
   `actionLineIds`, a sound cue, a visual kind with optional 3D tool params, and a
   `suggestedSeconds`.

**Long scripts**: if the script is estimated above **16,000 tokens** (characters / 3.5), the
analyze pass runs as map-reduce. Chunks of about 12k tokens are cut on heading boundaries, and
each chunk yields candidate assets plus a chunk summary. A final reduce call merges the
candidates, dedupes aliases and writes the synopsis and episode plan from the chunk summaries.
Episode passes never need the whole script.

**Rationale**:
- Each call stays small and focused, which matters for a 20B model.
- Progress can be reported per episode (FR-011).
- A failed episode can be retried on its own (FR-011).
- Prompt size stays well under the model's context (`gpt-oss:20b`, 131,072 tokens loaded on the
  LAN server).

Expected cost for one 60 s episode: about 30–60 s for the analyze pass and about 40–90 s for the
episode pass. That is within SC-002's 3 minutes (T075 measured 30 s for a 5-scene script).

**Alternatives considered**:
- One call that does everything. The output is too large, and one bad field fails the whole run.
- Three levels of calls (episode → segment → shot). This doubles the call count and the
  latency for little quality gain.

## R4. Durations: frames and the deterministic fitter (FR-008, SC-004)

**Decision**: All breakdown durations are **integer frames at 30 fps**. The model only suggests
seconds per shot. A pure function `fitDurations(episode, targetFrames)` in
`packages/shared/src/breakdown/durations.ts` sets the real values:

1. **Floor per shot**: `max(1 s, words(spoken) / 2.5 words·s⁻¹ + 0.3 s)`. Spoken lines must fit
   the time they get on screen.
2. **Scale** the non-dialogue time so the episode gets close to the target. Never go under the
   floors.
3. **Segments over 15 s** are split between shots. A single shot longer than 15 s is split into
   two shots: the second one holds the remaining lines and is marked `continued`.
4. **Segments under 4 s** are merged with a neighbour in the same setting. If there is none, the
   segment is padded up to 4 s.
5. **Round to whole frames** with largest-remainder rounding, so shots add up exactly to their
   segment and segments to their episode.
6. If the result is more than 20% away from the target, set the episode's `lengthWarning`
   (edge case, FR-019).

The same fitter runs again on review edits when the creator asks it to rebalance. Otherwise edits
keep the creator's numbers, and the validator only reports flags.

**Rationale**: Integer frames make "adds up exactly" checkable and keep it in line with the
timeline, which is also in frames. Doing this in code removes a whole class of model mistakes.

**Alternatives considered**:
- Milliseconds. These would need rounding again at timeline build time, and exact sums could
  drift.
- Trusting the model's numbers. 20B models are poor at arithmetic.

## R5. Breakdown storage: a versioned JSON document

**Decision**: Each breakdown version stores its whole result as one **`BreakdownDocument`**
(JSONB, validated by Zod) in the `Breakdown` row:
- the synopsis;
- the asset bible;
- the episodes, with their segments and shots.

Ids inside the document are stable (`nanoid`-style, generated server-side). Mentions are
`@{variantId}` tokens inside the shot text, so a rename changes only the asset or variant record
and every mention shows the new name (FR-014). Reference images are ordinary `Asset` rows
(`IMAGE`), referenced by id from the variant.

Review edits save the **whole document** through `PUT …/breakdowns/{version}` with
`baseRevision`, using the same optimistic lock as the 001 timeline. The client autosaves about
800 ms after the last change (FR-021) and keeps an undo stack of the last **20 document
snapshots** for the session.

**Rationale**:
- A breakdown is edited as a tree: split, merge, reorder, move between segments. Doing that on
  relational rows would mean many fiddly ordered updates.
- One validated document can be versioned (FR-012), exported (FR-022) and rebuilt into a
  timeline in a single, easy-to-test step.
- The expected maximum is 20 episodes × about 60 shots, which is under 1 MB of JSON.

**Alternatives considered**: Normalized `Episode`, `Segment`, `Shot` and `Mention` tables. These
would give per-row updates, but versioning would mean deep-copying many rows, and undo would be
much harder. The library (R10) is the only part that needs to be shared across projects, so it
alone gets its own table.

## R6. Structured output and repair

**Decision**: Reuse the 001 approach (`generateStoryScript`): `response_format: json_schema`
through LiteLLM to `ollama_chat`, a Zod parse, and up to **2 repair rounds** that return the
exact issues. Semantic checks also produce repair prompts:
- line coverage (R1);
- unknown asset or variant ids;
- a segment without a setting;
- 3D params that fail `Blender3dToolParams`.

For bad 3D params the shot is **downgraded** to an image placeholder with a `fallbackReason`
instead of repairing it (edge case: the 3D tools cannot make it). After two failed repairs the
episode is marked `failed` with a readable reason, and the other episodes are kept.

**Rationale**: This was proven in T075/T088, where a schema-valid script came on the first try in
24–30 s. The same mechanism covers both schema problems and the semantic problems that only the
server can see.

## R7. Jobs, queues and the single LLM slot (FR-011, FR-032)

**Decision**:
- **New queues**:
  - `script.write` (US2, write a script from an idea);
  - `breakdown.run` (US1, a full breakdown, or a retry of selected episodes).
- **Where they run**: both run in the existing `pipeline-worker`.
- **New job types** `SCRIPT_WRITE` and `BREAKDOWN` are added to `JobType`.
- **One LLM call at a time**: every LLM call in the worker goes through `withLlmSlot()`, an
  in-process mutex in `packages/shared/src/llm/slot.ts`. Today `script.generate` and the new
  queues each have `localConcurrency: 1`, and without the mutex two queues could each run one
  call. `pipeline-worker` stays a single replica, which is documented in compose.
- **Queue position** (FR-032) is computed from the `Job` table: the number of LLM-type jobs that
  are `QUEUED` or `RUNNING` and were created before this one. `GET /api/jobs/{id}` returns it.
- **Progress**: the job reports `analyze` first, then one step per episode. Each episode's
  `status` in the document is updated as it finishes.
- **Cancel**: the existing `POST /api/jobs/{id}/cancel`. The handler checks for cancellation
  between model calls and keeps the episodes that are already done.
- **Concurrency rule**: while a `breakdown.run` job is active for a version, the review screen
  shows that version **read-only** with live progress. The worker is the only writer during that
  time, so it never conflicts with review autosaves.

**Rationale**: This reuses pg-boss and the Job/JobStatus machinery from 001. The in-process mutex
is the simplest way to cover several queues, and the single-replica rule is already true.

**Alternatives considered**:
- One shared `llm.task` queue for every kind of LLM work. This is cleaner in theory, but it would
  mean moving the 001 `script.generate` handler.
- A Postgres advisory lock. It is more robust if we ever run several replicas, and it can be
  added later.

## R8. File upload and text extraction (FR-002)

**Decision**: `POST /api/projects/{id}/script/upload` takes multipart, up to **10 MB**, and
extracts the text in the web request:
- `.txt`/`.md`: `TextDecoder("utf-8", { fatal: true })`, so non-UTF-8 input is rejected with a
  clear 422;
- `.docx`: `mammoth.extractRawText` (BSD-2-Clause, pure JS, no network). Protected or corrupt
  files throw an error, which becomes a 422 that names the problem.

After extraction:
- More than **50,000 words** is rejected.
- The original file is stored in MinIO as an `Asset` of the new kind `DOCUMENT`.
- The text is returned for review. It is not saved over the current script until the creator
  accepts it (acceptance scenario US1-4).

**Rationale**: Extraction is bounded and takes under a second, so it does not count as
"long-running" under Principle III. A queue round trip would only add latency. `mammoth` is
installed at build time, so nothing is downloaded at runtime (Principle I).

**Alternatives considered**:
- `docx` or `officeparser`. They are heavier or bring native dependencies.
- Doing it in the worker. This adds latency and gains nothing.

## R9. One renderable timeline per episode (FR-024, FR-028)

**Decision**: Building an episode creates, or reuses, a **child project** (`Project.kind =
EPISODE`, with `parentProjectId` and `episodeKey`):
- Its width and height come from the aspect ratio: 9:16 is 1080×1920 and 16:9 is 1920×1080.
- Its `fps` is 30.
- Its tracks and clips are the ones `buildEpisodeTimeline()` produces.

Because the child is an ordinary project, preview, editing, the 409 lock, rendering and the
render cache all work with **no changes** (FR-028). One change is needed: asset lookup must also
see the parent project's assets (`projectId IN (child, parent)`), because reference images and
uploads live on the parent.

The home page lists only `STANDARD` projects. A project's episode timelines are reached from its
breakdown screen.

**Rationale**: This is the smallest change that gives each episode its own timeline and render,
with no rewrite of the 001 timeline, render or Player code.

**Alternatives considered**: A new `Timeline` table, with `Track.timelineId` replacing
`Track.projectId`. That is a cleaner model, but it touches every 001 timeline and render path and
the render cache key. It could be done later as a refactor without changing the API.

## R10. Global library (FR-029, FR-030)

**Decision**: A `LibraryAsset` table holds the type, name, aliases, description, a `variants` JSON
(each with its reference image asset ids) and timestamps. Reference images used by the library are
`Asset` rows with `projectId = null`, which is already the "global" pattern in 001.
- **Save to library** copies a project asset out of the breakdown document.
- **Import** copies it in and records `libraryAssetId` on the copy.
- **Update library** is a separate, explicit action (FR-030).
- **Before a breakdown exists**, imports are kept in `ProjectScript.libraryImports`. The analyze
  pass gets them as **fixed assets with fixed ids**, so it links names and aliases to them instead
  of creating duplicates (FR-015, SC-008).

Images are immutable objects, so a library entry and its copies can share the same `Asset` id.
Deleting the library entry does not delete images that projects still use.

## R11. Mention editing UI

**Decision**:
- **Storage**: shot text holds `@{variantId}` tokens.
- **Editing**: a plain `<textarea>` that shows mentions as `@Name·Variant`. Typing `@` opens a
  filtered list of variants (FR-018), grouped by Characters, Settings and Props, and picking one
  inserts the label.
- **Saving**: on blur or save, labels are mapped back to tokens by exact match. Asset names must
  be unique per type and variant names unique per asset, which the validator enforces.
- **Unresolved labels**: a label that matches nothing becomes a **missing mention** flag (FR-019).
- **Read mode**: mentions show as chips.

**Rationale**: No new rich-text dependency and nothing extra to bundle. This covers everything
FR-014 and FR-018 ask for.

**Alternatives considered**: TipTap/ProseMirror mention extensions. They are a large dependency
for one field.

## R12. Timeline build mapping (FR-025, FR-026)

**Decision**: `buildEpisodeTimeline(doc, episodeId, { width, height, fps })` is a pure function in
`packages/shared/src/breakdown/build-timeline.ts`. It returns the 001 `TimelineWrite` track list
plus a list of 3D jobs to start:
- **VISUAL track**: one clip per shot whose visual is `image`. It starts as a **placeholder**: no
  asset, with `props.placeholder = { shotId, label }`, and the label lists the setting variant,
  the characters and the action (max 200 characters). If the setting variant already has a
  reference image, that image is used and no placeholder is created.
- **OVERLAY_3D track**: one clip per shot whose visual is `3d`. The clip gets a `PENDING`
  `RENDER_3D` asset and an `asset3d.render` job, using the same path as 001's `autoRender3d`. The
  Blender `width`/`height` follow the aspect ratio.
- **TEXT track**: one clip per spoken line, timed inside its shot in proportion to the word
  counts. Lines over 200 characters (the 001 `ClipProps.text` limit) are split at sentence
  boundaries into consecutive clips. Text clips go in the **lower third** with a background. This
  fixes the 001 problem where the 3D overlay covered centred text.
- **Placeholder support**: two changes are needed. `validateTimeline` must accept a VISUAL clip
  with no asset when it has a `placeholder`. `StoryComposition` must draw a placeholder as a
  labelled slate, deterministic and with no network access. That is a composition contract
  change ([contracts/composition-props-delta.md](./contracts/composition-props-delta.md)), so the
  deterministic frame-hash test needs new reference hashes.
- **Filling a placeholder** (FR-026): sets the clip's `assetId` and removes `placeholder`. With
  `applyToSameSetting`, every other placeholder in the episode whose shot uses the same setting
  variant gets the same asset. The image is also added to that variant's reference images, so
  later builds use it automatically.
- **Rebuild** (FR-027): the child project stores `builtRevision`. If `timelineRevision >
  builtRevision`, the timeline has hand edits, and the API returns `409 HAND_EDITS` unless
  `confirmReplace` is set. Before any replace, the current tracks are copied into a
  `TimelineSnapshot`, and a snapshot can be restored.

## R13. Exports (FR-022)

**Decision**: `GET …/breakdowns/{version}/export?format=md|html|json&episode=<id?>`:
- `md` and `html` give a readable shot list. Each shot has its number, length, shot size, camera,
  action with mentions resolved, the lines with speakers, sound and the visual. Print styles make
  the HTML printable.
- `json` gives the validated `BreakdownDocument` plus `exportVersion: 1`, so it can be imported
  again later.

All of these are generated on the server from pure functions.

## R14. Testing strategy

- **Unit (Vitest)**, under `tests/unit/breakdown/`:
  - the parser (R2) on fixtures in several formats;
  - `fitDurations` with property-style cases (sums are exact, every segment is 4–15 s);
  - the coverage checker;
  - `checkBreakdown` flags;
  - mention label↔token conversion;
  - `buildEpisodeTimeline`, where the length equals the sum of the shots and there is one text
    clip per line;
  - the exports.
- **Contract**: `AnalyzeOutput`/`EpisodeOutput` JSON Schemas are generated from Zod and must stay
  accepted by `response_format`. An OpenAPI delta is added for the new routes.
- **Reference set** (SC-005, SC-008): 5 original scripts in `tests/fixtures/scripts/`, in pt-BR
  and English, in screenplay, prose and dash-dialogue formats, each with an expected list of
  characters and locations. `scripts/eval-breakdown.mjs` runs them against the live LLM and
  prints recall, the duplicate rate and the verbatim rate. It is manual, because it needs the LAN
  server.
- **Render**: the deterministic frame-hash test is updated for the placeholder slate.

## R15. Language

**Decision**: Prompts are in English. They tell the model to write synopsis, descriptions and
generated scripts **in the language of the source or idea**, and never to translate spoken lines.
Spoken lines are copied by id anyway (R1), so they cannot be translated.
