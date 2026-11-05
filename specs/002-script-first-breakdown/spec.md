# Feature Specification: Script-First Project Creation and Breakdown

**Feature Branch**: `002-script-first-breakdown`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "Script-first project creation (Phase A from docs/research/pavo-benchmark.md, section 5). When a creator starts a new project, the first screen is the script: they paste or upload their own script (TXT/DOCX/Markdown), or generate one from an idea with the local LLM, and choose aspect ratio (9:16 or 16:9), target duration and number of episodes. The local LLM then organizes it: synopsis (story type, audience, setting, summary, character profiles), breaks it into episodes, then segments (4–15 s, one setting each), then shots (duration, shot size, visual action, camera, dialogue/narration, sound). It also extracts an asset bible of characters, settings and props, each with a visual description and variants, and the shots reference those assets with @mentions. The creator reviews and edits everything on a review screen (merge/split/reorder segments and shots, edit text and durations, edit/add/remove assets and @mentions) before continuing. Then the platform builds the editor timeline automatically from the shots: text and subtitle clips from the dialogue/narration, 3D overlays via the existing Blender MCP tools where a shot asks for them, and placeholders where an image is needed that the creator can fill by uploading. Assets can be saved to a global library and reused across projects. No new AI services in this phase (no image, voice or AI-video generation); everything runs on the existing stack (LiteLLM local-llm on the LAN server, Blender MCP, Remotion, MinIO, Postgres/pg-boss) under constitution v2.0.0."

## Context

Today a project opens straight into the timeline editor. A short idea typed in the Script tab can
become a handful of text scenes. Creators who already have a written script have no way to bring it
in, and nothing keeps characters, places and objects consistent across scenes.

This feature makes the **script the starting point** of every project. The flow is three steps:
**Script → Breakdown and assets → Timeline**. Phase A uses only what the platform already has: the
local language model, the 3D renderer, the compositor and asset storage. Generating images, voices
or AI video belongs to later phases (B–D in `docs/research/pavo-benchmark.md`). This phase leaves
clear slots for those assets: placeholders the creator fills by uploading.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start a project from my own script (Priority: P1)

A creator clicks "New project" and lands on a script screen instead of the editor. They paste
their script or upload a file. They pick the format (vertical 9:16 or horizontal 16:9), a target
length and how many episodes it should become, then start the breakdown. A few minutes later they
see the organized result:
- a synopsis (story type, audience, setting, summary, character profiles);
- the script split into episodes, each episode into segments, and each segment into shots, with
  the original dialogue kept word for word.

**Why this priority**: This is the core of the request and the first thing every new project goes
through. On its own it already turns an unstructured script into a production plan the creator can
read, check and export.

**Independent Test**: Create a project from a sample script of about 1,500 words with dialogue and
three locations, requesting 2 episodes in 9:16. Check that a synopsis appears, that the script is
split into 2 episodes with segments and shots, that every shot has a duration, and that every
spoken line in the source appears unchanged in some shot.

**Acceptance Scenarios**:

1. **Given** the creator is on the new-project script screen, **When** they paste a script, choose
   9:16, 60 seconds per episode and 2 episodes, and start the breakdown, **Then** progress is shown
   and the result is a synopsis plus 2 episodes, each made of segments and shots.
2. **Given** a breakdown has finished, **When** the creator inspects any segment, **Then** it lasts
   4–15 seconds, has exactly one setting, and its shot durations add up to the segment duration.
3. **Given** the source script contains dialogue, **When** the breakdown finishes, **Then** every
   line of dialogue appears verbatim in exactly one shot, attributed to the right character.
4. **Given** the creator uploads a .docx, .txt or .md file, **When** the upload completes,
   **Then** its text shows in the script area for review before the breakdown starts.
5. **Given** the language model server cannot be reached, **When** the creator starts the
   breakdown, **Then** they get a clear message saying the AI server is unavailable, their script
   is kept, and they can retry.

---

### User Story 2 - Generate the script from an idea (Priority: P2)

A creator who has no script yet switches the script screen to "Generate from an idea". They
describe the story (premise, main characters, tone, ending) and set the same options (format,
length, episodes). The platform writes a full script. The creator can edit it on the script screen
before it goes to the same breakdown as in Story 1.

**Why this priority**: It widens the feature to creators without a script and replaces today's
"prompt → scenes" shortcut with the same structured pipeline. It depends on the breakdown from
Story 1 to be useful.

**Independent Test**: Enter a three-sentence idea, request 1 episode of 45 seconds and generate.
Check that a readable script with scene headings, action lines and dialogue appears and can be
edited, and that sending it to the breakdown produces a result as in Story 1.

**Acceptance Scenarios**:

1. **Given** the creator enters an idea and options, **When** they click generate, **Then** a full
   script appears in the editable script area within the expected time, written in the language of
   the idea.
2. **Given** a generated script, **When** the creator edits it and starts the breakdown, **Then**
   the breakdown uses the edited text, not the original output.

---

### User Story 3 - Review and edit the breakdown and the asset bible (Priority: P3)

After the breakdown, the creator sees a review screen with episodes, segments and shots, plus an
**asset bible** with three lists: **Characters**, **Settings** and **Props**. Each asset has a
name, a visual description and one or more variants (for example "Ana – everyday" and
"Ana – wedding dress"). Shots mention assets with `@` (for example `@Ana·everyday walks into
@Bakery·interior`). The creator can:
- edit any text and duration;
- split, merge, reorder, add and delete segments and shots;
- add, edit, rename and delete assets and variants;
- type `@` to pick an asset from a list when writing a shot.

Durations and references stay consistent as they edit.

**Why this priority**: The automatic breakdown will never be perfect. This step lets the creator
fix it before anything is built, and the asset bible is what keeps characters and places consistent
across the whole project.

**Independent Test**: On a finished breakdown:
- split one shot, merge two segments and move a shot to another segment;
- rename a character and check every mention updates;
- delete a prop that is mentioned and check the affected shots are flagged.

**Acceptance Scenarios**:

1. **Given** a breakdown with an asset "Ana", **When** the creator renames it "Ana Lima",
   **Then** every shot that mentions it shows the new name.
2. **Given** a shot that mentions a prop, **When** the creator deletes that prop, **Then** the
   platform warns how many shots reference it, and after confirmation those mentions are marked as
   missing so the creator can fix them.
3. **Given** a segment of 12 seconds, **When** the creator lengthens one of its shots so the
   segment would exceed 15 seconds, **Then** the platform flags the segment and offers to split it.
4. **Given** the creator is writing in a shot and types `@`, **When** the list appears, **Then**
   it shows the project's characters, settings and props with their variants, filtered as they type.
5. **Given** edits were made, **When** the creator reopens the project later, **Then** all edits
   are still there.

---

### User Story 4 - Build the timeline from the shots (Priority: P4)

When the creator is happy with the breakdown, they click "Build timeline" for an episode. The
platform assembles that episode's timeline in the existing editor:
- one text or subtitle clip per line of dialogue or narration, timed to its shot;
- a 3D overlay request for each shot that asks for one, rendered with the existing 3D tools;
- an **image placeholder** for each shot that needs a visual, labelled with what it should show
  (setting, characters, action).

The creator fills placeholders by uploading images or video and can preview and render as today.

**Why this priority**: This closes the loop from script to rendered video with what the platform
can do today, and it creates the slots that the image and video phases will fill automatically
later. It needs Stories 1 and 3 first.

**Independent Test**: Build the timeline for one episode of a reviewed breakdown. Check that:
- the timeline length equals the episode length;
- every dialogue line appears as a timed text clip;
- each placeholder names the shot it belongs to;
- uploading an image into a placeholder replaces it in the preview;
- the episode renders to a video file.

**Acceptance Scenarios**:

1. **Given** a reviewed episode of 60 seconds, **When** the creator builds its timeline, **Then**
   the editor opens with a 60-second timeline whose clips line up with the shots.
2. **Given** a shot marked as needing a 3D overlay of a type the 3D tools support, **When** the
   timeline is built, **Then** a 3D render job starts and the result lands on that shot's time
   range when ready.
3. **Given** a placeholder, **When** the creator uploads an image for it, **Then** the image takes
   the placeholder's place and time range, and every other shot that uses the same setting variant
   offers to reuse it.
4. **Given** a timeline built earlier that the creator then edited by hand, **When** they rebuild
   it from the breakdown, **Then** the platform warns that hand edits will be replaced and keeps the
   previous version so it can be restored.

---

### User Story 5 - Reuse assets across projects (Priority: P5)

A creator saves a character (with its description, variants and any uploaded reference image) to a
**global library**. In another project they add it from the library, either on the review screen
or before the breakdown so the model uses that existing character instead of inventing a new one.

**Why this priority**: Valuable for series and recurring characters, but each project works
without it.

**Independent Test**: Save a character from project A to the library. In project B, import it
before the breakdown, run the breakdown with a script that mentions the character's name, and check
that the shots reference the imported asset rather than a duplicate.

**Acceptance Scenarios**:

1. **Given** an asset in a project, **When** the creator saves it to the library, **Then** it
   appears in the library with its variants and reference images.
2. **Given** a library asset imported into a project, **When** the creator edits it there,
   **Then** the library copy is unchanged unless they choose to update the library.
3. **Given** a library character imported before the breakdown, **When** the script mentions that
   character by name or by a known alias, **Then** the breakdown links the mentions to the imported
   asset.

---

### Edge Cases

- **Very long scripts** (near the size limit): the breakdown works episode by episode and shows
  per-episode progress. If one episode fails, the others are kept, and the failed one can be
  retried on its own.
- **Script without dialogue** (narration only, or a prose story): shots carry narration lines
  instead of dialogue, and nothing is reported as missing.
- **Script that does not split into the requested number of episodes**, for example asking for 10
  episodes from 200 words: the platform proposes the largest sensible number, explains why, and
  lets the creator accept or change it.
- **Requested length that the script cannot fill or would overflow**: shot durations are scaled
  within the 4–15 s segment limits, and the creator is told the resulting length if it differs from
  the target by more than 20%.
- **Unsupported or unreadable files** (scanned PDFs, password-protected or corrupted .docx,
  non-UTF-8 text): rejected with a message naming the problem; nothing is lost from the script area.
- **The same character under several names** ("Dr. Lima", "Ana", "Mom"): merged into one asset
  with aliases; the creator can split them apart on the review screen.
- **Model output that breaks the expected structure**: repaired automatically up to twice. If it
  still fails, that step is marked failed with a readable reason, and earlier results are kept.
- **Mentions of assets that no longer exist** after edits are highlighted, and building the
  timeline is blocked until each one is fixed or removed.
- **3D request for something the 3D tools cannot make**: the shot gets an image placeholder
  instead, and the creator is told why.
- **Re-running the breakdown after editing the script**: produces a new version. The previous
  breakdown and its edits stay available and are not silently overwritten.

## Requirements *(mandatory)*

### Functional Requirements

**Project start and script input**

- **FR-001**: Creating a new project MUST open the script screen first. The timeline editor is
  reached after the breakdown, or directly for projects that skip it ("Start with an empty
  timeline").
- **FR-002**: Creators MUST be able to paste script text or upload a .txt, .md or .docx file of up
  to 10 MB and 50,000 words. The extracted text is shown for review before the breakdown.
- **FR-003**: Creators MUST be able to generate a script from a free-text idea (up to 4,000
  characters) and edit the result before the breakdown.
- **FR-004**: Before the breakdown, creators MUST choose the aspect ratio (9:16 or 16:9), a target
  length per episode (15 seconds to 5 minutes) and a number of episodes (1–20). The defaults are
  9:16, 60 seconds and 1 episode.
- **FR-005**: The script MUST be saved with the project as soon as it is entered, so leaving the
  page or a failed breakdown never loses it.

**Breakdown**

- **FR-006**: The breakdown MUST produce a synopsis with story type, target audience, setting
  (world and period), a short summary and a profile for each main character.
- **FR-007**: The breakdown MUST split the script into the requested number of episodes, each
  episode into segments, and each segment into shots, preserving the order of events in the source.
- **FR-008**: Every segment MUST last between 4 and 15 seconds and take place in exactly one
  setting. The shots in a segment MUST add up to the segment's duration, and every shot MUST last
  at least 1 second.
- **FR-009**: Every shot MUST record: duration, shot size (e.g., wide, medium, close-up), visual
  action, camera movement, dialogue or narration (with speaker), sound or music cue, and the visual
  it needs. The visual is one of: none (text only), an image of the setting/characters, or a 3D
  overlay of a supported type.
- **FR-010**: When the creator supplied the script, the breakdown MUST keep every line of dialogue
  and narration verbatim. It MUST NOT rewrite, translate or drop spoken text; it may only divide it
  among shots.
- **FR-011**: The breakdown MUST run as a background job with visible progress (per episode), MUST
  be cancellable, and MUST allow retrying a single failed episode without redoing the others.
- **FR-012**: Each breakdown run MUST be stored as a numbered version. Creators MUST be able to
  view and restore earlier versions.

**Asset bible**

- **FR-013**: The breakdown MUST extract the project's **characters**, **settings** and **props**.
  Each asset has a name, aliases, a visual description and at least one variant, and every variant
  has its own visual description.
- **FR-014**: Shots MUST reference assets through mentions tied to a specific asset variant, shown
  as `@Name·variant`, not as free text. Renaming an asset or variant MUST update every mention.
- **FR-015**: The breakdown MUST merge different names for the same character (titles, nicknames,
  relationships) into one asset with aliases, and MUST link mentions to assets imported from the
  library when the script uses their names or aliases.
- **FR-016**: Every asset variant MUST be able to hold one or more uploaded reference images.

**Review and editing**

- **FR-017**: Creators MUST be able to edit every field of the synopsis, episodes, segments, shots
  and assets, and to add, delete, reorder, split and merge segments and shots.
- **FR-018**: While writing shot text, typing `@` MUST offer a filtered list of the project's
  asset variants to insert as mentions.
- **FR-019**: The platform MUST continuously check the breakdown and flag:
  - segments outside 4–15 seconds;
  - shots under 1 second;
  - mentions of missing assets;
  - episodes whose length is more than 20% away from the target.
  Flags MUST point to the exact item.
- **FR-020**: Deleting an asset that is mentioned MUST require confirmation that states how many
  shots reference it, and afterwards those mentions MUST be flagged as missing.
- **FR-021**: All review edits MUST be saved automatically and survive reloads. An undo MUST be
  available for at least the last 20 edits in the session.
- **FR-022**: Creators MUST be able to export the breakdown of an episode or of the whole project
  as a readable document (shot list with all fields) and as structured data.

**Timeline build**

- **FR-023**: Creators MUST be able to build the timeline for one episode at a time. Building is
  blocked while that episode has unresolved missing-asset flags.
- **FR-024**: Each episode MUST map to its own renderable timeline in the project. Its length is
  the sum of its shot durations, and its format follows the project's aspect ratio.
- **FR-025**: The timeline build MUST create:
  - a timed text/subtitle clip for every dialogue or narration line;
  - a 3D overlay job for every shot whose visual is a supported 3D type;
  - an image placeholder for every shot whose visual is an image. Each placeholder is labelled
    with its shot, setting variant, characters and action.
- **FR-026**: Creators MUST be able to fill a placeholder by uploading an image or video, or by
  picking a reference image already attached to the shot's setting or character variant. An
  uploaded image MUST also be offered to the other shots that use the same setting variant.
- **FR-027**: Rebuilding a timeline that has hand edits MUST warn before replacing it and MUST keep
  the previous timeline version so it can be restored.
- **FR-028**: Built timelines MUST preview and render exactly like timelines created by hand, with
  no extra steps.

**Asset library**

- **FR-029**: Creators MUST be able to save a project asset (with variants and reference images) to
  a global library, browse and search the library by type and name, and import library assets into
  any project, both before and after a breakdown.
- **FR-030**: Importing MUST create a project copy. Edits in a project MUST NOT change the library
  unless the creator explicitly updates the library entry.

**Platform constraints**

- **FR-031**: All script generation and breakdown MUST use only the project's existing self-hosted
  language model through the existing gateway. This phase adds no image, voice or video generation
  service, and nothing may call a cloud service (constitution v2.0.0).
- **FR-032**: At most one language-model request MAY be in flight at a time across the platform.
  Breakdown jobs queue behind each other, and the creator sees their place in the queue.

### Key Entities

- **Script**: the source text of a project (pasted, uploaded or generated), plus its origin, the
  original file if one was uploaded, and edit history. A project has one current script.
- **Production Settings**: aspect ratio, target length per episode, number of episodes; set per
  project before the breakdown.
- **Breakdown (version)**: one numbered run of the breakdown over a script. It owns the synopsis,
  the episodes and the asset bible produced by that run, together with the creator's edits.
- **Synopsis**: story type, audience, setting, summary and character profiles for a breakdown.
- **Episode**: an ordered part of the story with a title, a target and an actual length, and
  status (pending, running, done, failed). It maps to one timeline once built.
- **Segment**: an ordered part of an episode, 4–15 seconds, in one setting (a setting variant).
- **Shot**: an ordered part of a segment with duration, shot size, visual action, camera,
  dialogue/narration with speaker, sound cue, required visual (none, image, 3D type) and its
  mentions.
- **Asset**: a character, setting or prop with name, aliases and description. It has one or more
  **Asset Variants** (name, visual description, reference images). It belongs to a project or to
  the global library.
- **Mention**: a link from a shot to an asset variant, kept by identity so renames carry through.
- **Placeholder**: a slot on a built timeline waiting for a visual, tied to its shot. It can be
  filled by an upload or by a reference image.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A creator can go from pasting a 1,500-word script to a reviewed breakdown and a built
  timeline for one episode in under 15 minutes of their own time, with no help.
- **SC-002**: For a single 60-second episode, the breakdown is ready in under 3 minutes. A
  5-episode script of about 5,000 words is fully broken down in under 15 minutes on the current AI
  server.
- **SC-003**: In creator-supplied scripts, 100% of dialogue lines appear verbatim in the breakdown,
  checked automatically against the source.
- **SC-004**: 100% of segments in a finished, unedited breakdown satisfy the 4–15 second and
  single-setting rules, and shot durations add up exactly to their segment and episode lengths.
- **SC-005**: On a reference set of 5 scripts, at least 90% of the named characters and locations
  are extracted as assets, with fewer than 1 in 10 being duplicates of the same character.
- **SC-006**: The length of a built timeline matches the sum of its shots exactly, and every
  dialogue line in the episode appears as a timed text clip.
- **SC-007**: No script text or edit is lost across a page reload, a failed breakdown or a
  cancelled job: 0 data-loss cases in the validation runs.
- **SC-008**: A character saved to the library and imported into a new project is linked by the
  breakdown (no duplicate created) in at least 9 of 10 test scripts that name it.

## Assumptions

- **One local creator.** The platform has no accounts or permissions, and the global library
  belongs to the single local user, as in feature 001.
- **Episode length and format.** The 5-minute maximum per episode and the 1–20 episode range follow
  the existing render limits (videos of 5 minutes or less). The defaults (9:16, 60 s, 1 episode)
  favour short vertical videos, the main use case seen in the benchmark.
- **Scripts.** Scripts may be in any language the model handles. Generated scripts are written in
  the language of the idea. Uploaded scripts are not translated.
- **PDFs** are out of scope for this phase, because extracting text from scanned or laid-out PDFs
  is unreliable. Creators can paste the text instead.
- **The existing self-hosted model is good enough.** That is `gpt-oss:20b` on the LAN server. The
  timing targets in SC-002 are measured on that server, and long scripts are processed episode by
  episode to stay within the model's context.
- **3D types are limited** to what the existing 3D tools offer (3D text/logo, simple primitive
  scenes, turntable). Anything else becomes an image placeholder.
- **Later phases.** Image generation (character sheets, keyframes), voice, lip sync and AI video
  are Phases B–D and out of scope here. The data kept per asset and per shot (visual descriptions,
  variants, reference images, placeholders) is meant to feed them later without restructuring.
- **Today's "prompt → scenes" generator** in the editor's Script tab is replaced by the
  script-first flow for new projects. Existing projects keep working as they are.
- **Exports.** The readable export is a document a person can print or share. The structured
  export uses the platform's own format so a breakdown can be re-imported later.
