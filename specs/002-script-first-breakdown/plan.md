# Implementation Plan: Script-First Project Creation and Breakdown

**Branch**: `002-script-first-breakdown` | **Date**: 2026-11-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-script-first-breakdown/spec.md`

## Summary

New projects start on a **script screen**. The creator pastes a script, uploads one
(.txt/.md/.docx) or generates one from an idea, then picks the aspect ratio, episode length and
episode count.

A background **breakdown** job on the existing pipeline worker turns the script into a versioned
`BreakdownDocument`, a validated JSON tree. It holds:
- a synopsis;
- an asset bible of characters, settings and props, each with variants;
- episodes, split into segments and then shots.

The job makes one **analyze** call (map-reduce for long scripts), then one **episode** call per
episode. Calls go through LiteLLM `local-llm`, one at a time.

**Dialogue is never retyped by the model.** The script is first split into numbered source lines.
The model refers to them by id, and the server copies the original text, so spoken lines are
verbatim by construction. Durations are set in code (integer frames, 4–15 s segments, exact sums).

The creator edits everything on a **review screen**, which autosaves with an optimistic revision,
keeps a 20-step undo and shows live validation flags. The review screen then **builds each
episode's timeline** as a child project of kind `EPISODE`, so the 001 editor, preview and render
work unchanged. The timeline gets:
- lower-third text clips per spoken line;
- Blender 3D jobs for shots that ask for them;
- labelled placeholder slates for shots that need an image, which the creator fills by upload.

A **global library** lets assets be reused across projects. No new service, container or AI
capability is added.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 24 LTS. This is unchanged from 001, and no Python
changes are needed.

**Primary Dependencies**: Unchanged from 001:
- Next.js 15.5 and React 19;
- Remotion 4.0.540;
- Prisma 7 and pg-boss 12;
- the `openai` SDK, pointed only at LiteLLM;
- Zod 4.

**New**: `mammoth` 1.x (BSD-2, pure JS) for .docx text extraction (R8). Nothing else.

**Storage**:
- **PostgreSQL** gets the new tables `ProjectScript`, `Breakdown` (JSONB document),
  `TimelineSnapshot` and `LibraryAsset`, plus new columns on `Project`.
- **MinIO** stores the uploaded scripts (`AssetKind.DOCUMENT`) and the reference images.

**Testing**:
- Vitest unit tests (parser, duration fitter, coverage checker, validator, timeline builder,
  exports) and contract tests (LLM schemas, OpenAPI delta).
- The deterministic frame-hash test, extended with a placeholder reference.
- A manual LLM evaluation script (`scripts/eval-breakdown.mjs`) over 5 fixture scripts.

**Target Platform**: The same single workstation as 001. The LLM is `gpt-oss:20b` on the LAN
Ollama server (10.0.0.78), reached through LiteLLM.

**Project Type**: The existing pnpm monorepo web application. New code goes into `apps/web`,
`apps/worker`, `packages/shared`, `packages/db` and `packages/compositions`.

**Performance Goals** (from the spec):
- under 3 min of breakdown per 60 s episode (SC-002);
- under 15 min for 5 episodes of about 5,000 words;
- autosave about 800 ms after the last edit;
- the review screen stays responsive up to 20 episodes × 60 shots.

**Constraints**:
- At most 1 LLM request in flight across all queues (FR-032).
- Dialogue verbatim (SC-003).
- Exact duration sums (SC-004).
- Offline except the LAN.
- No new images or ports.
- Episodes of 5 min or less and timelines within 001's limits (16 tracks, 200 clips per track).

**Scale/Scope**:
- one local user;
- scripts up to 50,000 words;
- 1–20 episodes;
- about 30 new API routes and handlers;
- 4 new screens: script, review, library, and the episode list on the review screen.

**Unknowns**: none left. Every open point is settled in [research.md](./research.md) R1–R15.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* (constitution v2.0.0)

| # | Gate | Pre-research | Post-design | Evidence |
|---|---|---|---|---|
| I | No cloud APIs, keys or endpoints; works with the internet off | ✅ | ✅ | All LLM calls go through LiteLLM `local-llm` (FR-031). `mammoth` is a build-time npm dependency with no network calls. No new outbound URL, and `lint-config` is unchanged and passes (quickstart A1, A10) |
| I | No runtime downloads; telemetry off | ✅ | ✅ | No new runtime assets. The placeholder slate uses the bundled fonts |
| II | Pure, deterministic compositions | ⚠️ needs a composition change | ✅ | The placeholder slate is drawn only from props and has no randomness or network access. The new `ClipProps` fields are optional, so existing hashes don't change. A new frame-hash reference is added ([composition-props-delta.md](./contracts/composition-props-delta.md)) |
| III | ≤ 4 render threads, one render at a time, one LLM request in flight, long work in the queue | ⚠️ two LLM queues could overlap | ✅ | The `withLlmSlot()` mutex covers every LLM call, and `pipeline-worker` stays a single replica (R7). The breakdown and script writing are pg-boss jobs. The .docx extraction in a request is bounded (10 MB) and takes under a second (R8). Render is unchanged |
| IV | 3D only through Blender MCP tools | ✅ | ✅ | Timeline build uses the existing `asset3d.render` path with the 3 existing tools. An unsupported 3D request becomes a placeholder (R6, R12) |
| V | Every component in compose; the LLM only through LiteLLM | ✅ | ✅ | No new service. The worker reaches the LLM only through LiteLLM |
| Stack | Pinned images, loopback ports, secrets in `.env`, buckets set up idempotently | ✅ | ✅ | No compose change other than a comment documenting `pipeline-worker` as a single replica. Uploads go to the existing `storyflow-assets` bucket |
| Workflow | Offline smoke test and deterministic render test before merge | ✅ | ✅ | Quickstart A1 (frame hashes) and A10 (offline smoke test) |

**Result**: Both pre-research warnings are resolved by design decisions (R7, R12) rather than
exceptions. No Complexity Tracking entries are needed.

## Project Structure

### Documentation (this feature)

```text
specs/002-script-first-breakdown/
├── spec.md
├── plan.md                          # This file
├── research.md                      # Phase 0: R1–R15
├── data-model.md                    # Phase 1: Prisma changes + BreakdownDocument
├── quickstart.md                    # Phase 1: Checks A1–A10
├── contracts/
│   ├── openapi-delta.yaml           # New and changed API routes
│   ├── llm-breakdown.md             # script.write / analyze / episode structured outputs
│   ├── queue-jobs-delta.md          # script.write, breakdown.run, single LLM slot
│   └── composition-props-delta.md   # placeholder slate, shotId
├── checklists/requirements.md
└── tasks.md                         # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/
├── db/prisma/
│   ├── schema.prisma                        # + ProjectScript, Breakdown, TimelineSnapshot, LibraryAsset, enums
│   └── migrations/<ts>_script_first/        # new migration
├── shared/src/
│   ├── breakdown/                           # NEW, pure and unit-tested
│   │   ├── document.ts                      # Zod BreakdownDocument + types
│   │   ├── parse-script.ts                  # source lines + hints (R2)
│   │   ├── durations.ts                     # fitDurations (R4)
│   │   ├── coverage.ts                      # line coverage check (R1)
│   │   ├── check.ts                         # checkBreakdown flags (data-model §2)
│   │   ├── mentions.ts                      # token ↔ label, usage counts
│   │   ├── edit-ops.ts                      # split/merge/move/rename/delete helpers
│   │   ├── build-timeline.ts                # buildEpisodeTimeline (R12)
│   │   ├── export.ts                        # md/html/json (R13)
│   │   ├── llm-schemas.ts                   # AnalyzeOutput, EpisodeOutput (+ JSON Schema)
│   │   └── prompts.ts
│   ├── llm/
│   │   ├── slot.ts                          # NEW withLlmSlot() mutex (R7)
│   │   ├── write-script.ts                  # NEW idea → screenplay text
│   │   └── run-breakdown.ts                 # NEW analyze + episode passes with repair
│   ├── queue/payloads.ts                    # + script.write, breakdown.run
│   ├── schemas/composition-props.ts         # + ClipProps.shotId/placeholder
│   └── timeline/validate.ts                 # placeholder rule
├── compositions/src/layers/layers.tsx       # placeholder slate in VISUAL layer
apps/
├── worker/src/
│   ├── pipeline.ts                          # + work(script.write), work(breakdown.run)
│   └── handlers/{script-write,breakdown-run}.ts
└── web/src/
    ├── app/projects/[projectId]/
    │   ├── script/page.tsx                  # script screen (US1/US2)
    │   └── breakdown/page.tsx               # review screen + episode list (US3/US4)
    ├── app/library/page.tsx                 # library (US5)
    ├── app/api/projects/[projectId]/{script,script/upload,script/generate,breakdowns/**,
    │        episodes/**,placeholders/**,timeline/snapshots/**,library-imports}/route.ts
    ├── app/api/library/**/route.ts
    ├── components/script/                   # ScriptInput, SettingsBar, IdeaForm, UploadReview
    ├── components/breakdown/                # SynopsisPanel, AssetBible, EpisodeTree, ShotEditor,
    │                                        # MentionTextarea, FlagsPanel, VersionPicker, BuildBar
    ├── components/library/                  # LibraryBrowser, ImportDialog
    ├── hooks/{useScript,useBreakdown,useUndo}.ts
    └── server/{script,breakdowns,episodes,library}.ts   # + projects.ts/timeline.ts changes
scripts/eval-breakdown.mjs                   # reference-set evaluation (SC-003/005/008)
tests/
├── unit/breakdown/*.test.ts
├── contract/{llm-schemas,openapi-delta}.test.ts
└── fixtures/scripts/                        # 5 original reference scripts (+ expected assets)
```

**Structure Decision**: This keeps the 001 monorepo layout. All breakdown logic that can be pure
lives in `packages/shared/src/breakdown/`, so the web UI (live validation, undo, mention parsing),
the API (authoritative validation, build, export) and the worker (post-processing) share one
tested implementation. Episode timelines are ordinary child `Project` rows (R9), so the 001
timeline, Player and render code is reused, with two small changes: asset lookup also sees the
parent project's assets, and the composition draws placeholders.

## Phasing (input for /speckit-tasks)

1. **Foundation**: the migration, the `BreakdownDocument` schema, the parser, the durations
   fitter, coverage, the `withLlmSlot` mutex, and the new queues and job types.
2. **US1 (MVP)**: the script screen (paste and upload), settings, the breakdown job (analyze and
   episode passes), progress, cancel and retry, and a read-only breakdown view.
3. **US2**: `script.write` and the idea form.
4. **US3**: review editing, the asset bible, mentions, flags, autosave, undo, versions and
   export.
5. **US4**: the placeholder composition change, the timeline builder, episode projects,
   placeholder fill, rebuild and snapshots.
6. **US5**: the library, imports before and after a breakdown, and the fixed-asset linking in the
   analyze pass.
7. **Polish**: the reference-set evaluation, quickstart A1–A10, and the offline smoke test.

## Complexity Tracking

No constitution violations need justifying.
