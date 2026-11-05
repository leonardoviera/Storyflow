---

description: "Task list for Script-First Project Creation and Breakdown"
---

# Tasks: Script-First Project Creation and Breakdown

**Input**: Design documents from `specs/002-script-first-breakdown/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: The spec does not ask for TDD. Three kinds of test task are included anyway:
- **Unit tests for the pure breakdown modules.** The plan and research R14 make them part of the
  design, and SC-003 and SC-004 are checked through them.
- **The deterministic render test.** The constitution requires it for any composition change.
- **The offline smoke test.** The constitution requires it before merge.

**Organization**: by the user stories in spec.md.
- **US1 (P1)**: start from my own script, then break it down.
- **US2 (P2)**: generate the script from an idea.
- **US3 (P3)**: review and edit the breakdown and the asset bible.
- **US4 (P4)**: build the timeline from the shots.
- **US5 (P5)**: reuse assets across projects.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

This is the existing pnpm monorepo: `apps/web`, `apps/worker`,
`packages/{shared,db,storage,compositions}`, `scripts/`, `tests/`.
- "Contracts" means `specs/002-script-first-breakdown/contracts/`.
- "DM" means `specs/002-script-first-breakdown/data-model.md`.
- "R<n>" means a decision in `research.md`.

**Global rules for every task** (constitution v2.0.0):

- Pin exact versions. No `^` or `~` in package.json.
- Never add a cloud SDK, a remote URL, telemetry or a runtime download.
- LLM calls go only through `llm()` in `packages/shared/src/llm/client.ts`, and they MUST be
  wrapped in `withLlmSlot()` (T012).
- Read config only through `getEnv()` (`packages/shared/src/env.ts`).
- Durations in the breakdown are **integer frames at 30 fps**.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependencies and folders for the new code.

- [X] T001 Add `mammoth` with an exact version (1.x, BSD-2-Clause) to `apps/web/package.json`
  dependencies. Run `corepack pnpm install` so that `pnpm-lock.yaml` updates. Confirm that
  `mammoth` has no install scripts and makes no network calls (R8).
- [X] T002 [P] Create `packages/shared/src/breakdown/index.ts`, a barrel re-exporting the
  breakdown modules created below. Add the subpath export `"./breakdown"` to
  `packages/shared/package.json` the same way the existing subpaths `./schemas`, `./timeline`,
  `./llm` and `./queue` are exported.
- [X] T003 [P] Create the fixture folder `tests/fixtures/scripts/` with 5 **original** reference
  scripts and a matching `<name>.expected.json` for each, listing
  `{ characters: [{ name, aliases[] }], locations: [name] }` (R14):
  - `padaria.md`: a pt-BR screenplay of about 1,500 words with 3 locations, `INT./EXT.` headings
    and `NAME: line` dialogue;
  - `farol.txt`: pt-BR prose narration with no dialogue;
  - `startup.md`: English, Fountain-style uppercase character lines;
  - `familia.md`: pt-BR dash dialogue. One character is called "Mãe", "Dona Rosa" and "Rosa";
  - `serie-ep.md`: pt-BR, names the character "Ana Lima", also called "Ana" and "Dra. Lima".

  Also generate `startup.docx` from `startup.md` with a small one-off script in the scratchpad,
  and commit only the `.docx`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the schema, the pure breakdown core, the LLM slot and the queues. Every story
depends on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Database (packages/db)

- [X] T004 Extend `packages/db/prisma/schema.prisma` exactly as described in DM §1.
  - **New enums**: `ProjectKind { STANDARD EPISODE }`, `ScriptOrigin { PASTE UPLOAD GENERATED }`,
    `BreakdownStatus { RUNNING READY PARTIAL FAILED CANCELLED }`,
    `AspectRatio { PORTRAIT_9_16 LANDSCAPE_16_9 }` and
    `BibleAssetType { CHARACTER SETTING PROP }`.
  - **Enum values**: add `SCRIPT_WRITE` and `BREAKDOWN` to `JobType`, and `DOCUMENT` to
    `AssetKind`.
  - **`Project` columns**: `kind ProjectKind @default(STANDARD)`, `parentProjectId String?`
    (self-relation, onDelete Cascade), `episodeKey String?`, `builtRevision Int?` and
    `currentBreakdownId String? @unique` (onDelete SetNull). Add
    `@@unique([parentProjectId, episodeKey])` and `@@index([kind, archivedAt, updatedAt])`.
  - **`ProjectScript`**:
    - `projectId @unique` (Cascade), `text String`, `origin ScriptOrigin`;
    - `sourceAssetId String?` → Asset (SetNull), `idea String?`;
    - `aspectRatio @default(PORTRAIT_9_16)`, `episodeSeconds Int @default(60)`,
      `episodeCount Int @default(1)`;
    - `libraryImports Json @default("[]")`, `revision Int @default(0)`, `updatedAt @updatedAt`.
  - **`Breakdown`**:
    - `projectId` (Cascade), `version Int`, `status BreakdownStatus`;
    - `sourceText String`, `sourceLines Json`, `settings Json`, `document Json`;
    - `revision Int @default(0)`, `jobId String?` → Job (SetNull), `createdAt`, `updatedAt`;
    - `@@unique([projectId, version])`.
  - **`TimelineSnapshot`**: `projectId` (Cascade), `timelineRevision Int`, `tracks Json`,
    `reason String`, `createdAt`, `@@index([projectId, createdAt])`.
  - **`LibraryAsset`**:
    - `type BibleAssetType`, `name String @db.VarChar(80)`, `aliases String[]`,
      `description String`, `variants Json`;
    - `createdAt`, `updatedAt`, `@@unique([type, name])`.
- [X] T005 Generate the migration `packages/db/prisma/migrations/<timestamp>_script_first/` with
  `prisma migrate dev --create-only --name script_first`. Check that the SQL adds the enum
  values with `ALTER TYPE … ADD VALUE` and does not recreate the existing enums. Regenerate the
  client (`packages/db/src/generated/`).
- [X] T006 Change `packages/db/src/index.ts` so it exports the new model types. Add
  `packages/db/src/breakdowns.ts` with these helpers:
  - `nextBreakdownVersion(projectId)`;
  - `updateBreakdownDocument(id, baseRevision, document, status?)`, a conditional `updateMany`
    on `revision` that throws `ConflictError` on 0 rows, the same pattern as
    `apps/web/src/server/timeline.ts`;
  - `writeEpisodeResult(breakdownId, episodeId, episode)`, a transaction with a row lock
    (`SELECT … FOR UPDATE` through `$queryRaw`) that replaces one episode in the document and
    bumps `revision`. The worker uses it (R7).

### Pure breakdown core (packages/shared/src/breakdown)

- [X] T007 [P] Write `packages/shared/src/breakdown/document.ts` with the Zod schemas from DM §2,
  with every limit exactly as written:
  - `BreakdownDocument` (`schemaVersion: 1`, `fps: 30`, `aspectRatio`);
  - `Synopsis`: storyType ≤ 80, audience ≤ 120, setting ≤ 300, summary ≤ 2,000, profile ≤ 1,000;
  - `BibleAsset`: name 1–80, aliases ≤ 10, description ≤ 2,000, variants ≥ 1;
  - `BibleVariant`: name 1–60, description ≤ 1,000, referenceAssetIds ≤ 8;
  - `Episode`, with status `pending|running|done|failed`, `sourceLineRange`, and optional `error`
    and `lengthWarning`;
  - `Segment`, with `settingVariantId` and `durationInFrames`;
  - `Shot`: `shotSize` enum `extreme_wide|wide|medium|medium_close|close_up|extreme_close_up|insert`,
    camera ≤ 120, action ≤ 1,000, sound ≤ 200, `continued?`;
  - `SpokenLine`: kind `dialogue|narration`, `speakerAssetId` nullable, text ≤ 2,000,
    `sourceLineId?`;
  - `ShotVisual`: a discriminated union of none, image with `fallbackReason?`, and 3d with
    `tool` + `params`;
  - `SourceLine`: `{ id, text, hint, speakerHint? }`;
  - `ScriptSettings`: aspectRatio, `episodeSeconds` int 15–300 with default 60, `episodeCount`
    int 1–20 with default 1.

  Also export `newId()`, which returns 12 URL-safe characters from `crypto.getRandomValues`, and
  the helpers `FPS = 30`, `secondsToFrames` and `dimensionsFor(aspectRatio)`, where
  `PORTRAIT_9_16` is 1080×1920 and `LANDSCAPE_16_9` is 1920×1080.
- [X] T008 [P] Write `packages/shared/src/breakdown/parse-script.ts`, which exports
  `parseScript(text): SourceLine[]` (R2):
  - normalize CRLF and drop blank lines;
  - number the remaining lines `L1…Ln`;
  - detect hints:
    - `heading`: `INT.`, `EXT.`, `INT./EXT.`, `I/E`, pt-BR `INT`/`EXT`/`CENA \d+`, Markdown `#`;
    - `dialogue`, in four forms:
      - `NAME: text`, where NAME is 1–4 words, which may be accented, and is uppercase or title
        case;
      - a Fountain uppercase character line followed by text, which folds into one line with
        `speakerHint`;
      - dash dialogue `— text` or `- text`, which gets no speakerHint;
      - an opening quote together with a speech verb;
    - `parenthetical`: `(…)`;
    - `action`: everything else.
  - also export `estimateTokens(text) = ceil(chars / 3.5)` and `countWords(text)`.
- [X] T009 [P] Write `packages/shared/src/breakdown/durations.ts`. It exports
  `fitDurations(episode, targetFrames): Episode` exactly as specified in R4:
  - a per-shot floor of `max(30, ceil((words/2.5 + 0.3) × 30))` frames;
  - scaling of the non-dialogue time toward the target;
  - splitting segments over 450 frames at shot boundaries, and splitting a single shot over 450
    frames into two shots, the second marked `continued`, with lines divided by word count;
  - merging segments under 120 frames with a neighbour in the same `settingVariantId`, or
    padding them to 120;
  - largest-remainder rounding so that shot sums equal the segment and segment sums equal the
    episode;
  - `lengthWarning = |total − target| > 0.2 × target`.

  The function must be pure and deterministic.
- [X] T010 [P] Write `packages/shared/src/breakdown/coverage.ts`. It exports
  `checkCoverage(lineIds: string[], shots: { spokenLineIds, actionLineIds }[])`, which returns
  `{ missing: string[], duplicated: string[] }` (R1). It also exports `linesInRange(sourceLines,
  from, to)`.
- [X] T011 [P] Write `packages/shared/src/breakdown/mentions.ts`:
  - the token regex `@\{([A-Za-z0-9_-]{12})\}`;
  - `labelFor(doc, variantId)`, which gives `@Name·Variant`, or `@Name` when the variant is
    named `default`;
  - `tokensToLabels(text, doc)`;
  - `labelsToTokens(text, doc)`, which matches labels exactly and leaves unknown labels
    untouched (R11);
  - `extractMentionIds(text)`;
  - `usageOf(doc, assetId | variantId)`, which returns `{ shotCount, shotIds }`.
- [X] T012 [P] Write `packages/shared/src/llm/slot.ts`. It exports `withLlmSlot<T>(fn: () =>
  Promise<T>): Promise<T>`, an in-process FIFO mutex so that only one LLM call is in flight at a
  time (R7, FR-032). Wrap the existing call in
  `packages/shared/src/llm/generate-script.ts` (`llm().chat.completions.create`) with it, and
  export it from `packages/shared/src/llm/index.ts`.
- [ ] T013 [P] Write `packages/shared/src/breakdown/check.ts`. It exports
  `checkBreakdown(doc, sourceLines): { errors: Issue[], flags: Flag[] }`, as in DM §2
  "Validation":
  - **errors**:
    - schema failures;
    - duplicate ids;
    - a setting variant that is not of type SETTING;
    - a speaker that is not a CHARACTER;
    - duplicate names, case-insensitive per type, and duplicate variant names per asset;
    - sum mismatches;
  - **flags**, each with `code`, a `path` string like `episodes[1].segments[3].shots[0]`, a
    message and `blocksBuild`:
    - `SEGMENT_DURATION` (<120 or >450 frames);
    - `SHOT_TOO_SHORT` (<30);
    - `MISSING_MENTION` (blocks the build);
    - `MISSING_SPEAKER` (blocks the build);
    - `EPISODE_LENGTH` (>20%);
    - `VERBATIM_DRIFT` (info).
- [ ] T014 Write unit tests in `tests/unit/breakdown/` for T008–T013:
  - `parse-script.test.ts`: every fixture from T003, and each hint form;
  - `durations.test.ts`:
    - property-style loops over random shot lists with a fixed seed, checking that sums are
      exact, every segment is 120–450 frames, every shot is ≥ 30 frames, and dialogue floors
      are respected;
    - the 20% warning;
  - `coverage.test.ts`: missing and duplicated lines;
  - `mentions.test.ts`: round trip, renames and unknown labels;
  - `check.test.ts`: each error and flag code.

  Add `tests/unit/breakdown/**` to the include list in `tests/vitest.config.ts` if needed.

### Queues and jobs (packages/shared, packages/db, apps/worker)

- [ ] T015 Extend `packages/shared/src/queue/payloads.ts` as described in
  contracts/queue-jobs-delta.md:
  - **Queue names**: add `scriptWrite: "script.write"` and `breakdownRun: "breakdown.run"`.
  - **`ScriptWritePayload`**: `idea` 1–4000, `aspectRatio`, `episodeSeconds` int 15–300 and
    `episodeCount` int 1–20.
  - **`BreakdownRunPayload`**: `breakdownId`, `mode` `full|episodes`, and `episodeIds?`, which is
    required when `mode = episodes`.
  - **`QUEUE_OPTIONS`**:
    - `script.write`: retryLimit 1, expire 600 s, exclusive;
    - `breakdown.run`: retryLimit 0, expire 3600 s, exclusive.
  - **`singletonKeyFor`**: `write:{projectId}` and `breakdown:{breakdownId}`.
- [ ] T016 Add `queuePositionFor(jobId)` to `packages/db/src/jobs.ts`. It counts the `Job` rows
  with type in {SCRIPT_GENERATION, SCRIPT_WRITE, BREAKDOWN} and status in {QUEUED, RUNNING}
  created before the given job, and returns null when the job itself is running or finished.
  Then extend `apps/web/src/server/jobs.ts` and `apps/web/src/app/api/jobs/[jobId]/route.ts` so
  the response includes `queuePosition` and `steps` (from `Job.output.steps`), as in
  contracts/openapi-delta.yaml `/api/jobs/{jobId}`.
- [ ] T017 Register stub handlers in `apps/worker/src/pipeline.ts`:
  `work(QUEUES.scriptWrite, { localConcurrency: 1 }, handleScriptWrite)` and
  `work(QUEUES.breakdownRun, { localConcurrency: 1 }, handleBreakdownRun)`. The handlers go in
  `apps/worker/src/handlers/script-write.ts` and `apps/worker/src/handlers/breakdown-run.ts`;
  each one throws "not implemented" for now. In `docker-compose.yml`, add a comment on
  `pipeline-worker` saying it MUST stay a single replica because of the LLM slot. Copy the
  change to `specs/001-local-video-platform/contracts/infra/docker-compose.yml`.
- [ ] T018 Change project listing and lookup:
  - `listProjects` in `apps/web/src/server/projects.ts` returns only `kind = STANDARD`;
  - `projectAssets` in `apps/web/src/server/timeline.ts` (and the equivalent asset lookup in
    `apps/web/src/server/renders.ts` and `apps/worker/src/handlers/video-render.ts`) includes
    the parent project's assets when `kind = EPISODE` (`projectId IN (id, parentProjectId)` OR
    null) (R9).

**Checkpoint**: run `corepack pnpm test`, tsc for each package and
`node scripts/lint-config.mjs`; all must pass. Then rebuild the stack with
`docker compose up -d --build`; `db-migrate` must exit 0, and 001 projects must still open and
render.

---

## Phase 3: User Story 1 - Start a project from my own script (Priority: P1) 🎯 MVP

**Goal**: New project → script screen → paste or upload → settings → breakdown job with progress
→ a read-only view of the synopsis, the bible and the episodes, segments and shots, with the
dialogue verbatim.

**Independent Test**: quickstart Checks A2, A3 and A4. Use `padaria.md` with 2 × 60 s at 9:16:
the result must have a synopsis, 2 episodes, no `SEGMENT_DURATION` flags and 100% of the dialogue
verbatim.

### Implementation for User Story 1

- [ ] T019 [P] [US1] Write `packages/shared/src/breakdown/llm-schemas.ts`, using Zod and
  `z.toJSONSchema`, the same way `StoryScriptJsonSchema` is built. It defines `AnalyzeOutput`,
  `AnalyzeChunkOutput` and `EpisodeOutput`, exactly as in contracts/llm-breakdown.md §2–§3:
  - `episodePlan.maxSensibleEpisodes`;
  - `speakerMap`;
  - `spokenLineIds` and `actionLineIds`;
  - `speakerByLine`;
  - `visual` as a union of none, image and 3d;
  - `suggestedSeconds` 1–15.

  Add `tests/unit/breakdown/llm-schemas.test.ts`. It checks that each JSON Schema is accepted by
  the `strict: true` rules: `additionalProperties: false` and every property listed in
  `required`.
- [ ] T020 [P] [US1] Write `packages/shared/src/breakdown/prompts.ts` with
  `analyzeSystemPrompt(settings)`, `analyzeChunkSystemPrompt()`, `analyzeReducePrompt()`,
  `episodeSystemPrompt(targetSeconds)` (which includes `BLENDER_TOOL_SUMMARIES`) and
  `breakdownRepairPrompt(issues)`. It also has the formatters `formatLines(sourceLines)` (output
  like `L3 [dialogue speaker=ANA] …`), `formatFixedAssets(imports)` and `formatAssetTable(doc)`.
  Every prompt must say:
  - output JSON only;
  - write descriptions in the source language;
  - never invent, rewrite or translate dialogue;
  - use only the given ids.
- [ ] T021 [US1] Write `packages/shared/src/llm/run-breakdown.ts`:
  - **`runAnalyze`** takes the sourceLines, settings, fixedAssets and an `onStep` callback.
    - It uses a single call, or map-reduce when `estimateTokens > 16000`, with chunks of about
      12k tokens cut on `heading` lines (R3).
    - It returns a partial document: the synopsis, the assets with real ids from `newId()`
      (keeping FIXED ids), `speakerMap` resolved to asset ids, and the episodes with
      `sourceLineRange` and `status: "pending"`.
    - It merges same-type assets that share a name or alias (FR-015).
  - **`runEpisode`** takes the doc, episode, sourceLines and speakerMap.
    - It makes the call, then runs these semantic checks: coverage (T010), id resolution,
      speakers present, and a CHARACTER for each dialogue line.
    - Failures produce a repair prompt, with at most 2 repair rounds (R6).
    - 3D params that fail `Blender3dToolParams` downgrade the shot to `{ kind: "image",
      fallbackReason }`.
    - It copies the spoken text from `SourceLine.text` (FR-010) and builds the shots and
      segments with `newId()`.
    - It runs `fitDurations` and returns `status: "done"`.
  - Every model call goes through `withLlmSlot` and `llm()`, with `response_format`
    json_schema, `strict: true` and model `local-llm`. Throw `BreakdownStepError(readable)`
    after the repairs run out.
- [ ] T022 [US1] Implement `apps/worker/src/handlers/breakdown-run.ts`:
  1. Load the Breakdown and the ProjectScript (for `libraryImports`), then mark the job RUNNING.
  2. If `mode = full`, run `runAnalyze` and save the document with status RUNNING.
  3. For each pending, failed or requested episode, in order:
     - check for cancellation (the Job status is CANCELLED) and stop if so;
     - set the episode to `running`, then run `runEpisode`;
     - save it with `writeEpisodeResult` (T006);
     - update `Job.progress` (analyze = 0.1, then `+0.9/episodeCount`) and `Job.output.steps`.
  4. If an episode fails, set `status: "failed"` with `error` and continue.
  5. The final status is READY, PARTIAL, FAILED (when the analyze pass failed) or CANCELLED (DM
     state machine).
  6. If LiteLLM cannot be reached (ECONNREFUSED, 5xx), fail with the readable message "AI server
     unavailable".
- [ ] T023 [P] [US1] Write `apps/web/src/server/script.ts`:
  - `getScript(projectId)`, which creates an empty `ProjectScript` lazily;
  - `putScript(projectId, input)`, with optimistic `baseRevision`, rejecting more than 50,000
    words with 422 and validating the settings with `ScriptSettings`;
  - `extractUpload(projectId, file)` (R8):
    - reject anything over 10 MB with 413;
    - accept only the extensions `.txt`, `.md` and `.docx`; anything else is 422
      `UNSUPPORTED_TYPE`;
    - decode txt/md with `new TextDecoder("utf-8", { fatal: true })`, else 422 `NOT_UTF8`;
    - read docx with `mammoth.extractRawText`; a throw becomes 422 `DOCX_UNREADABLE`;
    - more than 50,000 words is 422 `TOO_MANY_WORDS`;
    - store the original in the `storyflow-assets` bucket as an `Asset`, kind `DOCUMENT`, source
      `UPLOAD`, status READY;
    - return `{ text, wordCount, sourceAssetId }` without saving it as the script.
- [ ] T024 [US1] Add these routes, using the 001 route helpers in `apps/web/src/server/http.ts`
  and `errors.ts`:
  - `apps/web/src/app/api/projects/[projectId]/script/route.ts` (GET, PUT);
  - `apps/web/src/app/api/projects/[projectId]/script/upload/route.ts` (POST, multipart through
    `request.formData()`, `export const runtime = "nodejs"`).

  Error bodies must carry no stack traces.
- [ ] T025 [US1] Write `apps/web/src/server/breakdowns.ts`:
  - **`startBreakdown(projectId)`**:
    - return 422 when the script is empty;
    - run `parseScript`;
    - create a Breakdown with the next version, status RUNNING, the `sourceText` snapshot, the
      `sourceLines`, the `settings` snapshot including `fps: 30`, and an empty document;
    - set `Project.currentBreakdownId`;
    - create a Job of type `BREAKDOWN` and enqueue `breakdown.run` with mode full;
    - return `{ jobId, version }`.
  - **`listBreakdowns`**.
  - **`getBreakdown(projectId, version)`**, which returns the document, revision, status, jobId
    and `flags` from `checkBreakdown`.
  - **`retryEpisode(projectId, version, episodeId)`**: 409 if a breakdown job is active,
    otherwise enqueue with mode episodes.
- [ ] T026 [US1] Add these routes:
  - `apps/web/src/app/api/projects/[projectId]/breakdowns/route.ts` (GET list, POST start);
  - `apps/web/src/app/api/projects/[projectId]/breakdowns/[version]/route.ts` (GET; PUT comes in
    T040);
  - `apps/web/src/app/api/projects/[projectId]/breakdowns/[version]/episodes/[episodeId]/retry/route.ts`
    (POST).
- [ ] T027 [US1] Make the projects API script-first (FR-001):
  - `POST /api/projects` accepts `start: "script" | "empty_timeline"`, default `script`
    (`apps/web/src/server/projects.ts`, `apps/web/src/app/api/projects/route.ts`);
  - `apps/web/src/components/NewProjectDialog.tsx` routes to `/projects/{id}/script`, and to
    `/projects/{id}` for "Start with an empty timeline";
  - `apps/web/src/lib/api.ts` gets typed client functions for every new route in this story.
- [ ] T028 [P] [US1] Write `apps/web/src/hooks/useScript.ts`: load the script, autosave the text
  and settings about 800 ms after the last change with `baseRevision`, and on 409 refetch and
  show "changed elsewhere". It also returns a `saving|saved|error` state.
- [ ] T029 [P] [US1] Write the script components in `apps/web/src/components/script/`:
  - `SettingsBar.tsx`: aspect ratio 9:16 or 16:9, episode length 15–300 s, episodes 1–20, with
    the defaults 9:16, 60 and 1;
  - `ScriptInput.tsx`: a large textarea, the word count, a 50,000-word limit warning and the
    autosave status;
  - `UploadReview.tsx`: a file picker that accepts `.txt,.md,.docx`, calls the upload route,
    shows the extracted text with "Use this text" and "Cancel", and shows the error code
    messages in pt-BR.
- [ ] T030 [US1] Write the script screen `apps/web/src/app/projects/[projectId]/script/page.tsx`.
  It lays out SettingsBar, ScriptInput, UploadReview and a **Start breakdown** button. When
  clicked, it calls POST breakdowns and navigates to `/projects/{id}/breakdown`. Keep the tab
  layout ready for the "Generate from an idea" mode added in US2.
- [ ] T031 [P] [US1] Write `apps/web/src/components/breakdown/BreakdownProgress.tsx`, which
  polls `GET /api/jobs/{id}` (it can reuse `apps/web/src/hooks/useJob.ts`). It shows:
  - the queue position;
  - per-step status for analyze and each episode;
  - a **Cancel** button (`POST /api/jobs/{id}/cancel`);
  - a **Retry** button per failed episode;
  - the readable error when the AI server is unavailable, with a "your script was saved" note.
- [ ] T032 [P] [US1] Write the read-only view components in
  `apps/web/src/components/breakdown/`:
  - `SynopsisPanel.tsx`;
  - `AssetBible.tsx`, with Characters, Settings and Props tabs, aliases and variants;
  - `EpisodeTree.tsx`, showing episodes → segments (setting chip and seconds) → shots (size,
    camera, action with mentions as chips through `tokensToLabels`, the lines with speaker,
    sound and visual);
  - `FlagsPanel.tsx`, which lists the flags; clicking one scrolls to its path.
- [ ] T033 [US1] Write the breakdown page
  `apps/web/src/app/projects/[projectId]/breakdown/page.tsx`. It loads the current version, shows
  BreakdownProgress while RUNNING, then SynopsisPanel, AssetBible, EpisodeTree and FlagsPanel,
  read-only in this story. If `maxSensibleEpisodes` is less than the request, it shows the
  explanation from the analyze step.
- [ ] T034 [US1] Write `scripts/eval-breakdown.mjs`, a manual tool that needs the LAN LLM:
  - `--check-verbatim <projectId> <version>` loads the breakdown through the API and checks that
    every `dialogue` or `narration` source line appears exactly once with identical text
    (SC-003). It also checks that the duration sums are exact and every segment is 4–15 s
    (SC-004).
  - Directory mode runs all the fixtures and prints character and location recall against
    `*.expected.json`, plus the duplicate rate (SC-005). Directory mode is completed in T066.
- [ ] T035 [US1] Run quickstart Checks A2, A3 and A4 against the compose stack and fix any
  failures. Record the timings: under 3 min per 60 s episode (SC-002).

**Checkpoint**: US1 works on its own. This is the MVP: script → breakdown → read-only result.

---

## Phase 4: User Story 2 - Generate the script from an idea (Priority: P2)

**Goal**: an idea plus settings → a full, editable screenplay in the idea's language, which then
goes through the US1 breakdown.

**Independent Test**: quickstart Check A5.

### Implementation for User Story 2

- [ ] T036 [P] [US2] Write `packages/shared/src/llm/write-script.ts`, which exports
  `writeScript({ idea, settings })`:
  - It asks for plain screenplay text with `INT./EXT.` headings, action lines and `NAME:`
    dialogue, in the idea's language.
  - It sets a length guide of `150 words/min × episodeSeconds/60 × episodeCount`, ±20%.
  - It validates that the text is non-empty, under 50,000 words and has at least one heading or
    action line according to `parseScript`. If not, it does one repair round.
  - The call goes through `withLlmSlot`.
- [ ] T037 [US2] Implement `apps/worker/src/handlers/script-write.ts`. It runs `writeScript` and
  saves into `ProjectScript`: `text`, `origin = GENERATED`, `idea` and the settings, with
  `revision` incremented. On failure it leaves the existing script untouched. It updates the Job
  status, progress and error.
- [ ] T038 [US2] Add `startScriptWrite(projectId, { idea, ...settings })` to
  `apps/web/src/server/script.ts`. It creates a Job of type `SCRIPT_WRITE` and enqueues
  `script.write`. Add the route `apps/web/src/app/api/projects/[projectId]/script/generate/route.ts`
  (POST → 202 `{ jobId }`) and a client function in `apps/web/src/lib/api.ts`.
- [ ] T039 [US2] Write `apps/web/src/components/script/IdeaForm.tsx`, with an idea textarea of up
  to 4,000 characters with a counter, and a **Generate** button with job progress through
  `useJob`. Add a "Write my script" / "Generate from an idea" tab switch to
  `apps/web/src/app/projects/[projectId]/script/page.tsx`. When the job succeeds, reload the
  script into ScriptInput so it can be edited. Breakdown always uses the saved, edited text.
  Then run quickstart Check A5.

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: User Story 3 - Review and edit the breakdown and the asset bible (Priority: P3)

**Goal**: full editing of the synopsis, the bible and the episode tree, with `@` mentions, live
flags, autosave, 20-step undo, versions and export.

**Independent Test**: quickstart Checks A6 and A9.

### Implementation for User Story 3

- [ ] T040 [US3] Add `putBreakdown(projectId, version, { baseRevision, document })` to
  `apps/web/src/server/breakdowns.ts`:
  - 409 `BREAKDOWN_RUNNING` when the status is RUNNING;
  - Zod-validate and run `checkBreakdown`; any `errors` give a 422 with the issues;
  - save with `updateBreakdownDocument` (409 `STALE_REVISION` when the revision is stale);
  - return the breakdown with its flags.

  Add the PUT handler to `apps/web/src/app/api/projects/[projectId]/breakdowns/[version]/route.ts`.
- [ ] T041 [P] [US3] Write `packages/shared/src/breakdown/edit-ops.ts`, pure functions that return
  a new document:
  - `renameAsset` and `renameVariant`, which touch the record only;
  - `addAsset`, `addVariant`, `deleteAsset` and `deleteVariant`, which leave the tokens in place
    so they become `MISSING_MENTION`;
  - `updateShot` and `updateSegment`;
  - `splitShot(shotId, lineIndex)`, which keeps the segment total;
  - `mergeSegments(aId, bId, settingVariantId?)`;
  - `moveShot(shotId, toSegmentId, index)`;
  - `addShot`, `deleteShot`, `addSegment`, `deleteSegment` and `reorder`;
  - `rebalanceEpisode(episodeId)`, through `fitDurations`.

  Each one recomputes the segment and episode `durationInFrames` sums. Add unit tests in
  `tests/unit/breakdown/edit-ops.test.ts`.
- [ ] T042 [P] [US3] Write `apps/web/src/hooks/useUndo.ts`, a generic snapshot stack. Keep the
  last 20 states, with `push`, `undo`, `redo` and `canUndo`.
- [ ] T043 [US3] Write `apps/web/src/hooks/useBreakdown.ts`:
  - load the breakdown;
  - apply `edit-ops` locally;
  - recompute the flags locally with `checkBreakdown`;
  - push to `useUndo`;
  - autosave the whole document about 800 ms after the last change with `baseRevision`;
  - on 409 `STALE_REVISION`, refetch and tell the user;
  - while the status is RUNNING, poll and be read-only.
- [ ] T044 [P] [US3] Write `apps/web/src/components/breakdown/MentionTextarea.tsx` (R11):
  - a textarea showing `tokensToLabels`;
  - typing `@` opens a list of variants grouped by Characters, Settings and Props, filtered as
    the user types, with keyboard navigation (FR-018);
  - picking a variant inserts `@Name·Variant`;
  - on blur it converts the text with `labelsToTokens`.
- [ ] T045 [US3] Make `apps/web/src/components/breakdown/AssetBible.tsx` editable:
  - add, edit and rename assets and variants, and edit aliases;
  - deleting an asset or variant first calls the usage count route (T046), then shows a
    confirmation saying "N shots reference it" (FR-020) and applies `deleteAsset`.
- [ ] T046 [US3] Add the usage route
  `apps/web/src/app/api/projects/[projectId]/breakdowns/[version]/assets/[assetId]/route.ts`
  (GET → `usageOf`) and a client function in `apps/web/src/lib/api.ts`.
- [ ] T047 [US3] Make `apps/web/src/components/breakdown/EpisodeTree.tsx` and a new
  `apps/web/src/components/breakdown/ShotEditor.tsx` editable:
  - inline edits of every Shot field, with action through `MentionTextarea`, the lines with a
    speaker picker, and duration in seconds with 0.1 s steps converted to frames;
  - segment setting picker;
  - split, merge, add, delete and reorder for shots and segments, with reorder by drag using the
    `@dnd-kit` already in the web app;
  - "Rebalance durations" for each episode;
  - flags shown on the item they point to, with "Split segment" offered on `SEGMENT_DURATION`.
- [ ] T048 [P] [US3] Make `apps/web/src/components/breakdown/SynopsisPanel.tsx` editable, with
  every field and limit from T007.
- [ ] T049 [US3] Write `apps/web/src/components/breakdown/VersionPicker.tsx`, which lists the
  versions with their status. It has "Make current", which calls a new route
  `apps/web/src/app/api/projects/[projectId]/breakdowns/[version]/current/route.ts` (POST →
  `Project.currentBreakdownId`), and "Re-run breakdown", which starts a new version from the
  current script (edge case: the previous version and its edits stay). Wire undo and redo
  (Ctrl+Z, Ctrl+Shift+Z) and the autosave status into
  `apps/web/src/app/projects/[projectId]/breakdown/page.tsx`.
- [ ] T050 [P] [US3] Write `packages/shared/src/breakdown/export.ts`, which exports
  `exportMarkdown(doc, episodeId?)`, `exportHtml(doc, episodeId?)` and `exportJson(doc)` (R13):
  - the Markdown and HTML shot list has, per shot, its number, seconds, shot size, camera,
    action with mentions resolved to labels, `SPEAKER: line`, sound and visual;
  - the HTML includes print CSS and escapes all text;
  - the JSON has `{ exportVersion: 1, document }`.

  Add unit tests in `tests/unit/breakdown/export.test.ts`.
- [ ] T051 [US3] Add the route
  `apps/web/src/app/api/projects/[projectId]/breakdowns/[version]/export/route.ts` (GET
  `?format=md|html|json&episode=`, with the right `Content-Type` and `Content-Disposition`). Add
  export buttons for the whole project and for each episode to the breakdown page. Then run
  quickstart Checks A6 and A9.

**Checkpoint**: US1–US3 work. The creator can fix any breakdown before building.

---

## Phase 6: User Story 4 - Build the timeline from the shots (Priority: P4)

**Goal**: one episode → its own renderable timeline as a child project, with lower-third text
clips, 3D jobs and labelled placeholders that the creator fills by upload, plus a safe rebuild
with snapshots.

**Independent Test**: quickstart Check A7.

### Tests for User Story 4 (constitution-required)

- [ ] T052 [US4] Add a placeholder reference to `packages/compositions/src/reference-props.ts`:
  one VISUAL clip with `assetId: null` and `props.placeholder` set. Extend
  `apps/worker/src/tools/determinism.ts` to sample its frames. Record the new reference hashes,
  and confirm the existing references keep their hashes (contracts/composition-props-delta.md).

### Implementation for User Story 4

- [ ] T053 [P] [US4] Extend `ClipProps` in `packages/shared/src/schemas/composition-props.ts` with
  `shotId?: string (≤ 32)` and `placeholder?: { shotId: string (≤ 32), label: string (1–200) }`.
  Update `specs/001-local-video-platform/contracts/composition-props.md` with a pointer to the
  002 delta.
- [ ] T054 [P] [US4] Change `validateTimeline` in `packages/shared/src/timeline/validate.ts`:
  - a VISUAL clip with `assetId = null` is valid only when it has a `placeholder`;
  - a clip with an asset must not have a `placeholder`.

  The function must now receive `props`, so add `props?` to `ValidatableClip`. Add cases to
  `tests/unit/timeline.test.ts`.
- [ ] T055 [US4] Draw the placeholder slate in the VISUAL layer of
  `packages/compositions/src/layers/layers.tsx`:
  - the full frame filled with `style.palette[0]`, or `#1F2937` when there is no palette;
  - a dashed border;
  - the label in the project font, wrapped and centred;
  - an "IMAGE NEEDED" tag.

  No randomness, time or network (constitution II). Run `corepack pnpm test:render`; it must
  match T052.
- [ ] T056 [P] [US4] Write `packages/shared/src/breakdown/build-timeline.ts`, which exports
  `buildEpisodeTimeline(doc, episodeId, { width, height, fps })`. It returns `{ tracks:
  TimelineWrite["tracks"], jobs3d: { shotId, clipIndex, tool, params }[], placeholders: number }`
  (R12, DM §3):
  - **VISUAL**: one clip per `image` shot, using the setting variant's first reference image when
    it has one; otherwise a placeholder whose label combines the setting label, the character
    labels and the action, cut to 200 characters.
  - **OVERLAY_3D**: one clip per `3d` shot. Override the params' `width`/`height` with the
    episode dimensions.
  - **TEXT**: one clip per spoken line, timed inside the shot in proportion to word counts.
    Lines over 200 characters are split at sentence boundaries into consecutive clips. Each clip
    has `props.text`, a lower-third `transform` (y about +35% of the height for 9:16, +38% for
    16:9), a semi-transparent `background` and `shotId`.
  - Clip start frames are cumulative shot offsets, and the total equals the episode's sum of
    shots.

  Add `tests/unit/breakdown/build-timeline.test.ts`, which checks the length equals the sum of
  the shots, there is one text clip per line, long lines are split, and the placeholder labels
  are right (SC-006).
- [ ] T057 [US4] Write `apps/web/src/server/episodes.ts`:
  - **`listEpisodes(projectId)`** returns `{ episodeId, episodeProjectId, hasHandEdits,
    placeholderCount }`.
  - **`buildEpisode(projectId, episodeId, { confirmReplace })`**:
    - 409 `BREAKDOWN_RUNNING`;
    - 422 `BLOCKING_FLAGS` with the paths when the episode has `MISSING_MENTION` or
      `MISSING_SPEAKER` flags (FR-023);
    - find or create the child Project (`kind EPISODE`, `parentProjectId`, `episodeKey`, title
      `"<parent> — Ep N"`, `width`/`height` from `dimensionsFor`, `fps 30`);
    - if it has hand edits (`timelineRevision > builtRevision`) and `confirmReplace` is not set,
      return 409 `HAND_EDITS`;
    - otherwise, before replacing, save a `TimelineSnapshot` (`reason: "rebuild"`, keeping the
      last 10);
    - run `buildEpisodeTimeline`;
    - for each 3D job, create a `RENDER_3D` asset with status PENDING, put its id on the clip,
      then call `putTimeline` and set `builtRevision` to the new revision;
    - enqueue `asset3d.render` for each 3D job, the same way 001's `autoRender3d` does it in
      `apps/worker/src/handlers/script-generate.ts`;
    - return `{ episodeProjectId, revision, placeholders, jobs, snapshotId, downgraded }`.
- [ ] T058 [US4] Add these routes:
  - `apps/web/src/app/api/projects/[projectId]/episodes/route.ts` (GET);
  - `apps/web/src/app/api/projects/[projectId]/episodes/[episodeId]/timeline/route.ts` (POST).
- [ ] T059 [US4] Add `fillPlaceholder(episodeProjectId, clipId, { baseRevision, assetId,
  applyToSameSetting })` to `apps/web/src/server/episodes.ts` (FR-026):
  - check the asset is READY and IMAGE or VIDEO;
  - set `assetId` and remove `placeholder` on the clip;
  - with `applyToSameSetting`, find the parent breakdown shots that share the same
    `settingVariantId` and fill their placeholders too;
  - append the asset id to that variant's `referenceAssetIds` in the parent document (up to 8),
    through `updateBreakdownDocument`;
  - save through `putTimeline`.

  Add the route `apps/web/src/app/api/projects/[projectId]/placeholders/[clipId]/fill/route.ts`.
- [ ] T060 [US4] Add `listSnapshots` and `restoreSnapshot` to `apps/web/src/server/timeline.ts`.
  Restoring first snapshots the current tracks with `reason: "restore"`, then calls
  `putTimeline` with the snapshot's tracks. Add the routes
  `apps/web/src/app/api/projects/[projectId]/timeline/snapshots/route.ts` and
  `.../timeline/snapshots/[snapshotId]/restore/route.ts`.
- [ ] T061 [P] [US4] Write `apps/web/src/components/breakdown/BuildBar.tsx`, the episode list on
  the breakdown page. For each episode it shows **Build timeline** or **Rebuild**, disabled with
  the reason while blocking flags exist, plus "Open editor". On `HAND_EDITS` it shows a
  confirmation: "Hand edits will be replaced; the previous version is kept".
- [ ] T062 [US4] In the existing editor (`apps/web/src/app/projects/[projectId]/page.tsx`,
  `apps/web/src/components/ClipInspector.tsx`, `apps/web/src/components/timeline/ClipBlock.tsx`):
  - show placeholder clips with their label and an "IMAGE NEEDED" style;
  - when a placeholder is selected, ClipInspector offers to "Upload image/video" (reusing the
    001 upload flow), to "Use a reference image" from the shot's setting or character variants,
    and an "Apply to every shot in this setting" checkbox that calls the fill route;
  - for EPISODE projects, show a "Back to breakdown" link and a "Versions" menu (snapshots,
    restore).
- [ ] T063 [US4] Run quickstart Check A7 end to end and fix any failures: build, 3D jobs,
  placeholder fill with same-setting reuse, a hand edit followed by a rebuild with 409 and then
  a snapshot restore, and an MP4 render.

**Checkpoint**: script → breakdown → reviewed → episode timeline → rendered MP4.

---

## Phase 7: User Story 5 - Reuse assets across projects (Priority: P5)

**Goal**: save bible assets to a global library, then import copies before or after a breakdown.
Imported characters are linked, not duplicated.

**Independent Test**: quickstart Check A8.

### Implementation for User Story 5

- [ ] T064 [US5] Write `apps/web/src/server/library.ts`:
  - **`listLibrary({ type?, q? })`** searches by name or alias, case-insensitive.
  - **`saveToLibrary({ projectId, version, assetId })`**:
    - copy the type, name, aliases, description and variants with `referenceAssetIds`;
    - 409 `NAME_TAKEN` when the type and name already exist;
    - for each reference image, make sure an `Asset` with `projectId = null` exists by copying
      the row so it points at the same object key, because images are immutable (R10).
  - **`updateLibrary(id, { projectId, version, assetId })`** is the explicit update (FR-030).
  - **`deleteLibrary(id)`** keeps project copies and images.
  - **`importFromLibrary(projectId, libraryAssetId)`**:
    - with no current READY or PARTIAL breakdown, append to `ProjectScript.libraryImports` with
      its id kept;
    - otherwise add a copy with `libraryAssetId` to the current breakdown document, renaming it
      with " (2)" on a name clash.
- [ ] T065 [US5] Add these routes:
  - `apps/web/src/app/api/library/route.ts` (GET, POST);
  - `apps/web/src/app/api/library/[libraryAssetId]/route.ts` (PUT, DELETE);
  - `apps/web/src/app/api/projects/[projectId]/library-imports/route.ts` (POST).

  Add client functions in `apps/web/src/lib/api.ts`.
- [ ] T066 [US5] Make sure `runAnalyze` (`packages/shared/src/llm/run-breakdown.ts`) passes
  `libraryImports` as FIXED assets through `formatFixedAssets`. After the call, map any
  model-created asset whose name or alias matches a fixed asset onto the fixed id, so that
  mentions and speakers link to it (FR-015, SC-008). Add a unit test for that merge step using a
  stubbed model output, in `tests/unit/breakdown/fixed-assets.test.ts`. Finish the directory mode
  of `scripts/eval-breakdown.mjs`, which reports the SC-008 linking rate for `serie-ep.md` with
  "Ana Lima" imported.
- [ ] T067 [P] [US5] Write `apps/web/src/components/library/LibraryBrowser.tsx` (type tabs,
  search, cards with variants and reference thumbnails) and `ImportDialog.tsx`. Add the page
  `apps/web/src/app/library/page.tsx` and a "Library" link on the home page
  (`apps/web/src/app/page.tsx`).
- [ ] T068 [US5] Wire up the library actions:
  - "Save to library" and "Update library" on each asset in `AssetBible.tsx`, with "Update"
    shown only when `libraryAssetId` is set;
  - "Import from library" in `AssetBible.tsx`, and on the script screen before the breakdown
    (`apps/web/src/app/projects/[projectId]/script/page.tsx`), listing the pending imports.

  Then run quickstart Check A8.

**Checkpoint**: all five stories work independently.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T069 [P] Replace the old editor "Script" tab flow for **new** projects (spec assumption):
  `apps/web/src/components/PromptPanel.tsx` and `ScriptEditor.tsx` stay for existing projects
  that have `ScriptVersion` rows. For projects created script-first they show a link to the
  breakdown instead.
- [ ] T070 [P] Add pt-BR UI strings for every new screen and error code (`UNSUPPORTED_TYPE`,
  `NOT_UTF8`, `DOCX_UNREADABLE`, `TOO_MANY_WORDS`, `BREAKDOWN_RUNNING`, `STALE_REVISION`,
  `HAND_EDITS`, `BLOCKING_FLAGS`, `NAME_TAKEN`, AI unavailable), consistent with the existing UI
  wording in `apps/web/src/components/`.
- [ ] T071 [P] Write the contract test `tests/contract/openapi-delta.test.ts`, which parses
  `specs/002-script-first-breakdown/contracts/openapi-delta.yaml`, checks that every path in it
  has a matching `route.ts` under `apps/web/src/app/api/`, and checks the reverse for the new
  routes.
- [ ] T072 Run the full eval with `node scripts/eval-breakdown.mjs tests/fixtures/scripts` against
  the LAN LLM. Record the character and location recall (≥ 90%), duplicates (< 10%), verbatim
  (100%) and the SC-008 linking rate in
  `specs/002-script-first-breakdown/checklists/validation.md`. If a target is missed, tune
  `prompts.ts` (T020) and run it again.
- [ ] T073 Update `README.md`: the script-first flow, the library, and the single-replica
  `pipeline-worker` rule. Update the "LLM" section of
  `specs/001-local-video-platform/contracts/queue-jobs.md` with a pointer to the 002 queue delta.
- [ ] T074 Run the constitution gates:
  - `node scripts/lint-config.mjs`;
  - `corepack pnpm lint`;
  - tsc for each package;
  - `corepack pnpm test`;
  - `corepack pnpm test:render`;
  - `bash scripts/offline-smoke.sh` with the **internet uplink disconnected** and the LAN up.
    Run a breakdown during the offline window (quickstart A10).

  Record the results in `specs/002-script-first-breakdown/checklists/validation.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. T002 and T003 can run in parallel after T001.
- **Foundational (Phase 2)**: Depends on Setup and BLOCKS all user stories.
  - T004 → T005 → T006.
  - T007 comes first among the pure modules. T008–T013 can run in parallel once T007 exists;
    T009, T011 and T013 import T007's types.
  - T014 needs T008–T013.
  - T015 → T017. T016 needs T005. T018 needs T005.
- **User Stories (Phase 3+)**: All depend on Phase 2.
  - **US1 (P1)**: Needs nothing beyond Phase 2.
  - **US2 (P2)**: Needs Phase 2. The breakdown that follows generation comes from US1, but
    script writing and its UI can be built and tested without it.
  - **US3 (P3)**: Needs US1, which provides the breakdown data and the read-only components that
    T045 and T047 make editable.
  - **US4 (P4)**: Needs US1. Building is blocked by flags, which US1 already computes, so US3
    makes US4 nicer but is not required. T052–T055 (the composition change) can start right
    after Phase 2.
  - **US5 (P5)**: Needs US1. The bible UI actions in T068 need US3's editable `AssetBible`.
- **Polish (Phase 8)**: After the stories you want are done.

### Within Each User Story

- Pure modules before services, services before routes, and routes before UI.
- Worker handlers before the UI that triggers them.
- Each story ends with a quickstart validation task.

### Parallel Opportunities

- **Setup**: {T002, T003}.
- **Foundational**: {T008, T009, T010, T011, T012, T013} after T007, and {T015, T016, T018}
  after T005.
- **US1**: {T019, T020, T023}, then {T028, T029, T031, T032} once the routes exist.
- **US2**: T036 in parallel with the US1 UI work.
- **US3**: {T041, T042, T044, T048, T050}.
- **US4**: {T053, T054, T056}, then T061 in parallel with T057–T060.
- **US5**: T067 in parallel with T064–T066.
- **Across stories**: once Phase 2 is done, the US4 composition work (T052–T055) and US2
  (T036–T038) can go alongside US1.

---

## Parallel Example: User Story 1

```bash
# After the Phase 2 checkpoint:
Task: "T019 LLM schemas in packages/shared/src/breakdown/llm-schemas.ts"
Task: "T020 Prompts in packages/shared/src/breakdown/prompts.ts"
Task: "T023 Script service in apps/web/src/server/script.ts"

# After routes T024/T026:
Task: "T028 useScript hook in apps/web/src/hooks/useScript.ts"
Task: "T029 Script components in apps/web/src/components/script/"
Task: "T031 BreakdownProgress in apps/web/src/components/breakdown/BreakdownProgress.tsx"
Task: "T032 Read-only breakdown views in apps/web/src/components/breakdown/"
```

## Parallel Example: User Story 3

```bash
Task: "T041 Edit operations in packages/shared/src/breakdown/edit-ops.ts"
Task: "T042 useUndo in apps/web/src/hooks/useUndo.ts"
Task: "T044 MentionTextarea in apps/web/src/components/breakdown/MentionTextarea.tsx"
Task: "T048 Editable SynopsisPanel in apps/web/src/components/breakdown/SynopsisPanel.tsx"
Task: "T050 Exports in packages/shared/src/breakdown/export.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup (T001–T003).
2. Phase 2: Foundational (T004–T018). The tests, typecheck and config lint must pass, and 001
   must still work.
3. Phase 3: US1 (T019–T035).
4. **STOP and VALIDATE**: quickstart Checks A2–A4. A script now becomes a verified production
   plan.

### Incremental Delivery

1. Setup and Foundational: the schema and the pure core.
2. Add US1, then validate (A2–A4). **MVP**: script → breakdown.
3. Add US2, then validate (A5). This adds generation from an idea.
4. Add US3, then validate (A6, A9). This adds review, editing and export.
5. Add US4, then validate (A7). This adds episode timelines and render, closing the loop to
   video.
6. Add US5, then validate (A8). This adds the library.
7. Polish, ending with the evaluation (T072) and the offline gate (T074).

---

## Notes

- [P] tasks = different files, no dependencies.
- The [Story] label maps each task to a user story for traceability, and to the `US1`…`US5`
  labels on the GitHub issues (Project #6).
- Constitution gates: `pnpm lint:config`, `pnpm test:render` (T052/T055) and
  `scripts/offline-smoke.sh` (T074) MUST pass before merge.
- Never add a cloud fallback, even an optional one (constitution I). If the LAN LLM is down,
  fail loudly with "AI server unavailable".
- Commit after each task or logical group, using `Closes #<issue>` for the matching GitHub issue.
  Stop at any checkpoint to validate that story.
