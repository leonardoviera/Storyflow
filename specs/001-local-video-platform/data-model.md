# Data Model: Local Storytelling & Video Automation Platform

Two kinds of storage:

- **PostgreSQL**, schema `public`, managed by Prisma. Holds metadata only. The queue lives in the
  `pgboss` schema, which pg-boss owns and Prisma never touches.
- **MinIO** holds every binary. Rows refer to objects by `bucket` + `objectKey` and never store
  URLs or local paths.

## Entity overview

```text
Template 1─* Project 1─* ScriptVersion 1─* Scene
                │  1                        │ 0..1
                │  └─ currentScriptVersion   │
                ├─* Track 1─* Clip *─0..1 Asset
                ├─* Asset (uploads, 3D outputs, final renders)
                ├─* Job ──0..1 Asset (output)
                └─* Render 1─1 Job, Render ─0..1 Asset (MP4)
```

## Entities

### Project
A single video being made.

| Field | Type | Rules |
|---|---|---|
| id | cuid | PK |
| title | string | 1–120 chars |
| prompt | text? | the original creative prompt, ≤ 4000 chars |
| templateId | FK Template? | the composition template it started from |
| compositionId | string | Remotion composition ID, default `StoryComposition` |
| width, height | int | 16–7680, both even (H.264 requirement) |
| fps | int | one of 24, 25, 30, 60 |
| durationInFrames | int | ≥ 1; recalculated from the clips on every timeline save |
| currentScriptVersionId | FK ScriptVersion? | the script version currently applied |
| timelineRevision | int | starts at 0; +1 on each `PUT /timeline` (optimistic lock) |
| archivedAt | datetime? | soft delete |
| createdAt, updatedAt | datetime | |

### ScriptVersion
An LLM-written (or hand-edited) script. Never changed after it is created.

| Field | Type | Rules |
|---|---|---|
| id | cuid | PK |
| projectId | FK Project | cascade delete |
| version | int | unique per project, auto-increments from 1 |
| source | enum `LLM` \| `MANUAL` | |
| model | string? | LiteLLM model alias (e.g., `local-llm`) when the source is `LLM` |
| sourcePrompt | text? | |
| content | json | MUST pass the [StoryScript schema](./contracts/story-script.schema.json) |
| createdAt | datetime | |

### Scene
One scene in a script, stored as its own row so the timeline can reference it.

| Field | Type | Rules |
|---|---|---|
| id | cuid | PK |
| scriptVersionId | FK ScriptVersion | cascade delete |
| order | int | unique per script version, starts at 0 |
| title | string | ≤ 120 |
| narration | text | ≤ 2000 |
| visualPrompt | text | ≤ 1000 |
| durationInFrames | int | ≥ 1 |
| asset3d | json? | `Asset3dSpec` from the StoryScript schema; null if the scene has no 3D |

### Track

| Field | Type | Rules |
|---|---|---|
| id | cuid | PK |
| projectId | FK Project | cascade delete |
| kind | enum `VISUAL` \| `OVERLAY_3D` \| `TEXT` \| `AUDIO` | |
| order | int | unique per project; higher numbers draw on top (visual kinds) |
| muted, locked | bool | default false |

### Clip
Something placed on a track.

| Field | Type | Rules |
|---|---|---|
| id | cuid | PK |
| trackId | FK Track | cascade delete |
| sceneId | FK Scene? | set null on delete |
| assetId | FK Asset? | restrict delete. Required for `VISUAL`, `OVERLAY_3D`, and `AUDIO` tracks; null for `TEXT` |
| startFrame | int | ≥ 0 |
| durationInFrames | int | ≥ 1 |
| trimStartFrame | int | ≥ 0, default 0 |
| props | json | per-clip props (text, transform, opacity, transitions). Checked against `ClipProps` in [composition-props.md](./contracts/composition-props.md) |

**Rules**:
- Clips on the same track MUST NOT overlap: `[startFrame, startFrame + durationInFrames)` ranges
  must not intersect. This is checked in the service layer when a timeline is saved.
- The clip's kind MUST fit its track's kind. For example, a `VISUAL` track needs an `IMAGE` or
  `VIDEO` asset, and an `OVERLAY_3D` track needs a `RENDER_3D` asset.

### Asset
One MinIO object.

| Field | Type | Rules |
|---|---|---|
| id | cuid | PK |
| projectId | FK Project? | null for shared or system assets (fonts, template media) |
| kind | enum `IMAGE` \| `VIDEO` \| `AUDIO` \| `MODEL_3D` \| `RENDER_3D` \| `FONT` \| `FINAL_RENDER` | |
| status | enum `PENDING` \| `READY` \| `FAILED` | `PENDING` until the upload is confirmed (HEAD check) |
| source | enum `UPLOAD` \| `BLENDER` \| `RENDER` \| `SYSTEM` | |
| bucket | string | `storyflow-assets`, or `remotion-videos` for `FINAL_RENDER` |
| objectKey | string | unique with `bucket`. Pattern: `projects/{projectId}/{kind}/{assetId}.{ext}` |
| mimeType | string | must be on an allow-list per kind |
| sizeBytes | bigint? | set when the asset becomes READY. Upload limit 2 GiB |
| sha256 | string? | 64 hex chars, set when READY. Part of the determinism hash |
| width, height | int? | images, video, 3D renders |
| durationMs | int? | audio and video |
| sourceJobId | FK Job? | the job that produced it (Blender or render) |
| metadata | json | default `{}` |
| createdAt | datetime | |

### Template
A starting point for a composition. A few are seeded, including `reference`, which the offline
smoke test and the determinism test use.

| Field | Type | Rules |
|---|---|---|
| id | cuid | PK |
| slug | string | unique, kebab-case |
| name | string | |
| compositionId | string | must exist in the Remotion root |
| defaultProps | json | MUST pass the composition's inputProps schema |
| thumbnailAssetId | FK Asset? | |

### Job
The app's own record of a pg-boss job. Its status is shown in the UI.

| Field | Type | Rules |
|---|---|---|
| id | cuid | PK |
| projectId | FK Project | cascade delete |
| type | enum `SCRIPT_GENERATION` \| `ASSET_3D` \| `VIDEO_RENDER` | maps to the queues in [queue-jobs.md](./contracts/queue-jobs.md) |
| status | enum `QUEUED` \| `RUNNING` \| `SUCCEEDED` \| `FAILED` \| `CANCELLED` | |
| queueJobId | uuid? | pg-boss job ID |
| input | json | the queue payload (checked by Zod) |
| output | json? | result summary (e.g., `{ scriptVersionId }`, `{ assetId }`) |
| progress | float | 0–1 |
| error | text? | message for the user when the job fails |
| attempts | int | default 0 |
| createdAt, startedAt, finishedAt | datetime | |

**Job state machine**

```text
QUEUED ──start──▶ RUNNING ──ok──▶ SUCCEEDED
  │                 │  └──err──▶ FAILED ──retry (attempts < 3)──▶ QUEUED
  └──cancel──▶ CANCELLED ◀──cancel──┘
```
- Only the worker that holds the pg-boss lock moves a job from QUEUED to RUNNING.
- SUCCEEDED and CANCELLED are final.
- FAILED is final once `attempts` reaches 3.

### Render
A snapshot of the exact inputs used for a video render. This is what makes renders repeatable
and lets the app skip a render it has already done.

| Field | Type | Rules |
|---|---|---|
| id | cuid | PK |
| projectId | FK Project | cascade delete |
| jobId | FK Job | unique |
| compositionId | string | |
| inputProps | json | the canonical props snapshot (asset IDs, no URLs) |
| inputPropsHash | string | SHA-256 of canonical JSON (sorted keys) + the referenced assets' `sha256` + `compositionId` + the Remotion version |
| codec | string | `h264` |
| outputAssetId | FK Asset? | the `FINAL_RENDER` asset |
| renderMs | int? | |
| createdAt | datetime | |

**Rule**: `POST /renders` with an `inputPropsHash` that already has a successful Render returns
that Render instead of queueing a new one, unless `force: true` is passed.

## Prisma schema (`packages/db/prisma/schema.prisma`)

```prisma
// Prisma 7: connection URL is supplied via prisma.config.ts + @prisma/adapter-pg.
generator client {
  provider = "prisma-client"
  output   = "../src/generated"
}

datasource db {
  provider = "postgresql"
}

enum ScriptSource {
  LLM
  MANUAL
}
enum TrackKind {
  VISUAL
  OVERLAY_3D
  TEXT
  AUDIO
}
enum AssetKind {
  IMAGE
  VIDEO
  AUDIO
  MODEL_3D
  RENDER_3D
  FONT
  FINAL_RENDER
}
enum AssetStatus {
  PENDING
  READY
  FAILED
}
enum AssetSource {
  UPLOAD
  BLENDER
  RENDER
  SYSTEM
}
enum JobType {
  SCRIPT_GENERATION
  ASSET_3D
  VIDEO_RENDER
}
enum JobStatus {
  QUEUED
  RUNNING
  SUCCEEDED
  FAILED
  CANCELLED
}

model Project {
  id                     String          @id @default(cuid())
  title                  String          @db.VarChar(120)
  prompt                 String?
  templateId             String?
  template               Template?       @relation(fields: [templateId], references: [id], onDelete: SetNull)
  compositionId          String          @default("StoryComposition")
  width                  Int             @default(1920)
  height                 Int             @default(1080)
  fps                    Int             @default(30)
  durationInFrames       Int             @default(1)
  currentScriptVersionId String?         @unique
  currentScriptVersion   ScriptVersion?  @relation("CurrentScript", fields: [currentScriptVersionId], references: [id], onDelete: SetNull)
  timelineRevision       Int             @default(0)
  archivedAt             DateTime?
  createdAt              DateTime        @default(now())
  updatedAt              DateTime        @updatedAt

  scriptVersions ScriptVersion[] @relation("ProjectScripts")
  tracks         Track[]
  assets         Asset[]
  jobs           Job[]
  renders        Render[]

  @@index([archivedAt, updatedAt])
}

model ScriptVersion {
  id           String       @id @default(cuid())
  projectId    String
  project      Project      @relation("ProjectScripts", fields: [projectId], references: [id], onDelete: Cascade)
  version      Int
  source       ScriptSource
  model        String?
  sourcePrompt String?
  content      Json
  createdAt    DateTime     @default(now())

  scenes      Scene[]
  currentFor  Project?     @relation("CurrentScript")

  @@unique([projectId, version])
}

model Scene {
  id               String        @id @default(cuid())
  scriptVersionId  String
  scriptVersion    ScriptVersion @relation(fields: [scriptVersionId], references: [id], onDelete: Cascade)
  order            Int
  title            String        @db.VarChar(120)
  narration        String
  visualPrompt     String
  durationInFrames Int
  asset3d          Json?

  clips Clip[]

  @@unique([scriptVersionId, order])
}

model Track {
  id        String    @id @default(cuid())
  projectId String
  project   Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  kind      TrackKind
  order     Int
  muted     Boolean   @default(false)
  locked    Boolean   @default(false)

  clips Clip[]

  @@unique([projectId, order])
}

model Clip {
  id               String  @id @default(cuid())
  trackId          String
  track            Track   @relation(fields: [trackId], references: [id], onDelete: Cascade)
  sceneId          String?
  scene            Scene?  @relation(fields: [sceneId], references: [id], onDelete: SetNull)
  assetId          String?
  asset            Asset?  @relation(fields: [assetId], references: [id], onDelete: Restrict)
  startFrame       Int
  durationInFrames Int
  trimStartFrame   Int     @default(0)
  props            Json    @default("{}")

  @@index([trackId, startFrame])
}

model Asset {
  id          String      @id @default(cuid())
  projectId   String?
  project     Project?    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  kind        AssetKind
  status      AssetStatus @default(PENDING)
  source      AssetSource
  bucket      String
  objectKey   String
  mimeType    String
  sizeBytes   BigInt?
  sha256      String?     @db.Char(64)
  width       Int?
  height      Int?
  durationMs  Int?
  sourceJobId String?
  sourceJob   Job?        @relation("JobOutputs", fields: [sourceJobId], references: [id], onDelete: SetNull)
  metadata    Json        @default("{}")
  createdAt   DateTime    @default(now())

  clips              Clip[]
  templateThumbnails Template[]
  renderOutputs      Render[]

  @@unique([bucket, objectKey])
  @@index([projectId, kind])
}

model Template {
  id               String    @id @default(cuid())
  slug             String    @unique
  name             String
  compositionId    String
  defaultProps     Json
  thumbnailAssetId String?
  thumbnailAsset   Asset?    @relation(fields: [thumbnailAssetId], references: [id], onDelete: SetNull)

  projects Project[]
}

model Job {
  id         String    @id @default(cuid())
  projectId  String
  project    Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  type       JobType
  status     JobStatus @default(QUEUED)
  queueJobId String?   @unique @db.Uuid
  input      Json
  output     Json?
  progress   Float     @default(0)
  error      String?
  attempts   Int       @default(0)
  createdAt  DateTime  @default(now())
  startedAt  DateTime?
  finishedAt DateTime?

  outputs Asset[]  @relation("JobOutputs")
  render  Render?

  @@index([projectId, createdAt])
  @@index([status, type])
}

model Render {
  id             String   @id @default(cuid())
  projectId      String
  project        Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  jobId          String   @unique
  job            Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)
  compositionId  String
  inputProps     Json
  inputPropsHash String   @db.Char(64)
  codec          String   @default("h264")
  outputAssetId  String?
  outputAsset    Asset?   @relation(fields: [outputAssetId], references: [id], onDelete: SetNull)
  renderMs       Int?
  createdAt      DateTime @default(now())

  @@index([projectId, inputPropsHash])
}
```

**Checks done in the service layer, not by the database**: clips must not overlap, clip and
asset kinds must match their track, the StoryScript and `ClipProps` JSON must pass schema
checks, and width and height must be even. The Zod schemas live in `packages/shared` and are
used by both the API and the workers.
