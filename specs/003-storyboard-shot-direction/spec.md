# Feature Specification: Storyboard Shot Direction

**Feature Branch**: `003-storyboard-shot-direction`

**Created**: 2026-11-06

**Status**: Draft

**Input**: User description: "Storyboard (from the Pavo revisit, docs/research/pavo-benchmark.md section 2.5). Bring the breakdown's shots up to a production storyboard: per shot, character blocking and eyelines, camera angle, lens/look, the frame the shot ends on, and continuity with the previous shot; per segment, an audio and on-screen-text directive (subtitles or not, music, ambient sound); per project, a visual style. Show an episode as a storyboard table with one row per shot and export it. Each segment gets a generation brief: one prose paragraph that combines the style, the referenced assets and the shots, ready for the later image and video phases. Even though no image model is provisioned yet, assume LiteLLM serves one: storyboard frames are generated through LiteLLM, always, like every other AI call (user direction, 2026-11-06)."

## Context

Feature 002 turns a script into episodes, segments and shots. Each shot records its duration,
shot size, camera movement, visual action, dialogue and sound. A revisit of the Pavo benchmark
(section 2.5) showed that a production storyboard carries more direction per shot: where each
character stands and where they look, the camera angle and lens, the frame the shot ends on and
how it continues the previous shot. Each segment also states whether on-screen text is allowed and
how music and ambient sound behave, and the whole project has one visual style.

Today that direction only exists if the language model happens to write it into the visual action.
The creator cannot see it at a glance, edit it on its own or check that it is there. This feature
gives it proper fields, a storyboard view to review it and an export to share it. It also prepares
a **generation brief** per segment, and uses it to generate **storyboard frames**: one image per
shot, drawn from the brief and the reference images of the assets it mentions.

Every AI call in the platform goes through LiteLLM, the local AI gateway, and image generation is
no exception. No image model is provisioned yet; this feature assumes LiteLLM will serve one under
its own alias and behaves cleanly when it does not. This feature builds on the breakdown of
feature 002.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Richer direction in every shot (Priority: P1)

A creator runs the breakdown on their script. Every shot now also comes with the camera angle,
the blocking and eyelines of the characters in it, an optional lens or look note, the frame the
shot ends on and whether it continues the previous shot. The creator sees these on the breakdown
screen next to the fields they already know.

**Why this priority**: Everything else in this feature (the table, the export, the brief) only
has value if the direction exists. It is also the gap the benchmark showed most clearly.

**Independent Test**: Run the breakdown on a reference script with a two-character dialogue scene
and check that each shot shows an angle, blocking that names both characters, and continuity
marks on shots that pick up from the previous one, while the dialogue stays verbatim.

**Acceptance Scenarios**:

1. **Given** a script with a scene where two characters talk, **When** the breakdown finishes,
   **Then** every shot of that scene has a camera angle from the platform's list and blocking text
   that mentions each on-screen character as an asset mention.
2. **Given** a shot that the model marks as continuing the previous shot, **When** the creator
   views it, **Then** it is visibly marked as a continuation and names how it connects (for
   example, the same action from a closer angle).
3. **Given** a creator-supplied script, **When** the breakdown finishes, **Then** every line of
   dialogue is still verbatim and no direction field contains quoted dialogue.
4. **Given** a breakdown made before this feature, **When** the creator opens it, **Then** it
   still loads, the new fields show as empty, and the creator can re-run one episode to fill them.

---

### User Story 2 - Review an episode as a storyboard table (Priority: P2)

The creator switches an episode to a storyboard view: a table with one row per shot, grouped by
segment, with the columns shot number, time and duration, shot size, angle, visual action,
blocking and eyelines, camera, dialogue and sound. They scan the whole episode, spot a weak shot
and edit the cell in place. They then export the storyboard to share it with someone.

**Why this priority**: The tree view of feature 002 shows one shot at a time. A table is how
storyboards are read and checked in practice, and it is the format the benchmark's storyboard
skill produces.

**Independent Test**: Open the storyboard view of an episode with at least 10 shots, edit one
angle and one blocking cell, reload the page, and check the edits are kept; export the episode and
check every shot and column is in the file.

**Acceptance Scenarios**:

1. **Given** an episode with 3 segments and 12 shots, **When** the creator opens the storyboard
   view, **Then** they see 12 rows in story order under 3 segment headers, each header showing the
   segment's setting and duration.
2. **Given** the storyboard view, **When** the creator edits a cell and leaves it, **Then** the
   change is saved, appears in the breakdown view too, and can be undone.
3. **Given** a shot whose duration the creator changes in the table, **When** the segment no longer
   fits 4–15 seconds, **Then** the same flag as in the breakdown view appears on that segment.
4. **Given** an episode, **When** the creator exports the storyboard, **Then** they get a readable
   document and a spreadsheet file, both with one row per shot and every column of the table.

---

### User Story 3 - Visual style and segment directives (Priority: P3)

Before or after the breakdown, the creator sets the project's visual style (for example "realist
1990s film, soft natural light, film grain"). Each segment carries a directive for on-screen text,
music and ambient sound, which defaults to the project's setting and can be changed per segment.
When the timeline is built, a segment with on-screen text turned off gets no subtitle clips.

**Why this priority**: These settings apply to many shots at once and matter most when images and
video are generated later, so they are less urgent than the per-shot direction and the table.

**Independent Test**: Set a visual style and turn subtitles off for one segment, build the
timeline for that episode, and check that the segment has no subtitle clips while the others do,
and that the style shows on every segment's brief.

**Acceptance Scenarios**:

1. **Given** a project, **When** the creator sets the visual style, **Then** it is saved with the
   project, shown at the top of the breakdown and storyboard views, and given to the breakdown so
   the shots' lens and look notes agree with it.
2. **Given** project defaults of "subtitles on, consistent music, ambient sound on", **When** the
   creator turns subtitles off for one segment, **Then** only that segment changes and the
   storyboard view shows the override.
3. **Given** a segment with subtitles off, **When** the creator builds the episode timeline,
   **Then** the dialogue of that segment creates no visible subtitle clips, and the dialogue stays
   in the breakdown and in the export.

---

### User Story 4 - A generation brief per segment (Priority: P4)

For each segment the creator can open a generation brief: one prose paragraph written from the
segment's data. It starts with the visual style, names the setting and characters with their
reference images, describes each shot in order (size, angle, camera, action, blocking, end frame,
dialogue) and ends with the segment's directive. The creator copies it, or keeps it for the later
image and video phases.

**Why this priority**: The brief is the input of the storyboard frames (User Story 5) and of the
later video phase. It costs little once the fields from stories 1 and 3 exist.

**Independent Test**: Open the brief of a segment with 3 shots and two characters, check that it
contains the style, both characters, all 3 shots in order with their dialogue verbatim and the
directive; edit a shot and check the brief follows.

**Acceptance Scenarios**:

1. **Given** a segment with 3 shots, **When** the creator opens its brief, **Then** it describes
   the 3 shots in order and lists the reference images of every asset mentioned.
2. **Given** an open brief, **When** the creator edits a shot's blocking, **Then** the brief shows
   the change without being regenerated by the language model.
3. **Given** a brief, **When** the creator copies it, **Then** the clipboard holds plain text with
   asset names in place of mention codes.

---

### User Story 5 - Generate storyboard frames through LiteLLM (Priority: P5)

From the storyboard view the creator generates a frame for one shot, for a whole segment or for
the whole episode. Each frame is an image drawn from the shot's part of the brief, the visual
style and the reference images of the mentioned assets, in the project's aspect ratio. Frames
appear as thumbnails in the table. Each shot keeps a history of frames, the creator picks one, and
the picked frame fills the shot's image placeholder when the timeline is built.

**Why this priority**: It needs stories 1, 3 and 4 and an image model behind LiteLLM. It is also
the step that turns the storyboard from text into pictures, which is what the benchmark's
Keyframes panel offers.

**Independent Test**: With an image model configured in LiteLLM, generate frames for a 3-shot
segment, regenerate one, pick the second version, build the timeline and check the picked frame is
in that shot's clip. With no image model, check the action explains why it is unavailable and
nothing else breaks.

**Acceptance Scenarios**:

1. **Given** an image model served by LiteLLM, **When** the creator generates frames for a
   segment, **Then** each shot gets a frame in the project's aspect ratio, with visible progress
   per shot and the option to cancel.
2. **Given** a shot with two frames, **When** the creator picks the older one, **Then** it becomes
   the shot's frame in the table, the export and the next timeline build.
3. **Given** a shot whose placeholder the creator already filled by hand, **When** they generate a
   frame, **Then** the uploaded image is not replaced unless the creator picks the new frame.
4. **Given** no image model behind LiteLLM, or LiteLLM unreachable, **When** the creator tries to
   generate, **Then** they see a clear message naming the missing image model, and the breakdown,
   storyboard, exports and timeline build keep working.

---

### Edge Cases

- **Shot without characters** (an empty landscape, an insert of an object): blocking is empty and
  that is not flagged; the angle is still required.
- **Character off screen who speaks** (voice over, phone call): blocking states the character is
  off screen; the dialogue keeps its speaker.
- **More than 4 characters in a shot**: blocking may describe a group ("the class, facing the
  board") instead of naming each one; only mentioned characters are checked.
- **Continuity on the first shot of a segment**: allowed only when the previous segment is in the
  same setting; otherwise it is flagged.
- **The model returns an angle outside the list**: it is mapped to the closest value or set to the
  default (eye level) and the shot is flagged for review; the breakdown does not fail.
- **The visual style changes after the breakdown**: shots are not rewritten automatically; briefs
  pick up the new style at once, and the creator may re-run episodes to refresh lens notes.
- **Very long direction text**: each field has a length limit shown while typing; the brief of a
  segment stays readable because it is built from the fields, not appended to.
- **Old breakdowns**: they load unchanged with empty new fields, and are never flagged as broken
  for missing them.
- **Frame generation fails for one shot**: the other shots keep their frames; the failed shot shows
  the error and can be retried alone.
- **A shot is edited after its frame was generated**: the frame is kept but marked as out of date
  until the creator regenerates or accepts it.
- **A mentioned asset has no reference image**: the frame is still generated from the text, and
  the shot notes that consistency for that asset is not guaranteed.

## Requirements *(mandatory)*

### Functional Requirements

**Shot direction**

- **FR-001**: Every shot MUST be able to record, in addition to the fields of feature 002: a
  camera angle, blocking and eyelines, a lens or look note, an end frame and a continuity mark with
  a short note.
- **FR-002**: The camera angle MUST be one of a fixed list: eye level, high angle, low angle,
  overhead, dutch angle, over the shoulder, point of view. The list MUST be shown in the creator's
  interface language.
- **FR-003**: Blocking and eyelines MUST support asset mentions in the same way as the visual
  action, and MUST state where each mentioned on-screen character is and where they look.
- **FR-004**: The breakdown MUST fill the new shot fields for every new run. It MUST keep the
  verbatim-dialogue rule of feature 002 and MUST NOT put quoted dialogue in any direction field.
- **FR-005**: The platform MUST flag a shot whose mentioned on-screen characters are missing from
  its blocking, and a continuity mark on a shot that cannot continue the previous one (first shot
  of an episode, or a change of setting).
- **FR-006**: Breakdowns created before this feature MUST open without errors, show the new fields
  as empty and not be flagged for them. Re-running one episode MUST fill them for that episode.

**Storyboard view and export**

- **FR-007**: Creators MUST be able to view an episode as a storyboard table with one row per shot,
  grouped by segment, with the columns: shot number, start time and duration, shot size, angle,
  visual action, blocking and eyelines, camera, dialogue (with speaker) and sound. Lens, end frame
  and continuity MUST be available as optional columns.
- **FR-008**: Every cell of the table except shot number and start time MUST be editable in place,
  with the same saving, undo and flag rules as the breakdown view of feature 002.
- **FR-009**: Creators MUST be able to export an episode's storyboard, or all episodes, as a
  readable document and as a spreadsheet file with one row per shot and every column of the table.

**Style and directives**

- **FR-010**: A project MUST have an optional visual style of up to 300 characters, editable before
  and after the breakdown and given to the breakdown as context.
- **FR-011**: A project MUST have default segment directives: on-screen text (subtitles on or
  off), music (none, consistent across the episode, or a specific cue) and ambient sound (on or
  off). Each segment MUST be able to override any of them.
- **FR-012**: Building a timeline MUST NOT create visible subtitle clips for segments whose
  on-screen text directive is off. Their dialogue MUST stay in the breakdown and in exports.

**Generation brief**

- **FR-013**: Each segment MUST have a generation brief, built from its data and not by the
  language model, containing: the visual style, the setting and each mentioned character and prop
  with their reference images, every shot in order with its direction and verbatim dialogue, and
  the segment directive.
- **FR-014**: The brief MUST update as soon as the data it is built from changes, and MUST be
  copyable as plain text with asset names in place of mention codes.

**Storyboard frames**

- **FR-015**: Creators MUST be able to generate a storyboard frame for one shot, every shot of a
  segment or every shot of an episode. Each frame MUST use the shot's part of the generation brief,
  the visual style and the reference images of the mentioned assets, in the project's aspect ratio.
- **FR-016**: Frame generation MUST run as a background job with progress per shot, cancel and
  retry of a single failed shot, like the breakdown of feature 002.
- **FR-017**: Every shot MUST keep the history of its frames. The creator MUST be able to pick one;
  the picked frame MUST show in the storyboard table and export and MUST fill the shot's image
  placeholder when the timeline is built, without replacing an image the creator uploaded unless
  they pick the frame.
- **FR-018**: A frame whose shot changed after it was generated MUST be marked as out of date.

**Constraints**

- **FR-019**: Every AI call in this feature, text and image, MUST go through LiteLLM. Breakdown
  work MUST use the existing language-model alias under the one-request-at-a-time rule of feature
  002. Frame generation MUST use a dedicated image alias in LiteLLM, backed only by a self-hosted
  model, and MUST NOT call any image service directly.
- **FR-020**: When LiteLLM has no image model or cannot be reached, frame generation MUST be
  unavailable with a clear message, and every other part of the feature MUST keep working.

### Key Entities

- **Shot** (extended from feature 002): adds camera angle, blocking and eyelines (with mentions),
  lens or look note, end frame, and a continuity mark with a note.
- **Segment directive**: on-screen text, music and ambient sound for one segment; any value not set
  falls back to the project default.
- **Project visual style**: a short description of the look of the whole project, with the default
  segment directive.
- **Storyboard export**: a readable document or spreadsheet of one or more episodes, one row per
  shot.
- **Generation brief**: a read-only paragraph per segment, derived from the segment, its shots, the
  style and the asset bible; it is never edited directly.
- **Storyboard frame**: an image generated for one shot, with the brief text it came from, the time
  it was made and whether it is the picked frame or out of date. A shot has zero or more frames.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the 5 reference scripts of feature 002, in unedited breakdowns, 100% of shots have
  a camera angle from the list and at least 90% of shots with mentioned on-screen characters have
  blocking that names all of them.
- **SC-002**: The rules of feature 002 do not regress: 100% verbatim dialogue, 100% of segments
  within 4–15 seconds and in one setting, and shot durations adding up exactly.
- **SC-003**: A breakdown of the same script takes at most 25% longer than with feature 002 alone,
  on the same AI server.
- **SC-004**: A creator can review a 15-shot episode in the storyboard view and correct 3 cells in
  under 5 minutes, with no help.
- **SC-005**: Exports contain 100% of the episode's shots and every column, and the spreadsheet
  opens in common spreadsheet programs without repair.
- **SC-006**: For 100% of segments, the brief contains the style, every mentioned asset, every shot
  in order with its dialogue verbatim, and the directive, and it reflects an edit within 1 second.
- **SC-007**: Breakdowns made before this feature open with 0 errors and 0 new flags in the
  validation runs.
- **SC-008**: With an image model behind LiteLLM, frames for a 15-shot episode are ready without
  intervention, and at least 9 in 10 frames match their shot's size and show the mentioned
  characters, judged on the reference scripts.
- **SC-009**: With no image model configured, 100% of the other acceptance scenarios still pass,
  and the frame action shows the unavailable message every time.

## Assumptions

- **Feature 002 comes first.** Editing the new fields in the breakdown view relies on the editing
  screen of feature 002 (its User Story 3). If that screen is not done yet, the storyboard view of
  this feature is where they are first edited.
- **Fixed angle list.** Seven angles cover common storyboard practice and keep the output easy to
  check. Lens and look stay free text because they depend on the style.
- **Subtitles off means no visible subtitle clips.** The success criterion of feature 002 that
  every dialogue line becomes a timed text clip applies only to segments with on-screen text on.
- **Default directives.** Subtitles on, consistent music, ambient sound on. This matches today's
  timeline build, so existing behaviour does not change until the creator opts out.
- **LiteLLM serves images too.** By user direction, every AI call points to LiteLLM, whether or not
  a model is provisioned behind it yet. No image model is installed today; the feature is built and
  tested against the image alias anyway, and the unavailable path (FR-020) is what runs until one
  is added on the LAN server.
- **Constitution amendment needed.** Constitution v2.0.0 allows the app to request only the
  `local-llm` alias. A dedicated, self-hosted image alias (for example `local-image`) needs an
  amendment before planning; it stays within Principle I, since the backend remains on the private
  network and reached only through LiteLLM.
- **The brief is the frame prompt.** The same brief text feeds frame generation now and the video
  phase later, so its content is kept stable.
- **Spreadsheet format.** A CSV file encoded so that accents and non-Latin scripts open correctly
  in common spreadsheet programs. The readable document follows the export of feature 002.
- **Language.** Direction text is written in the script's language, like the visual action in
  feature 002. Field names and the angle list follow the interface language.
- **Frames are per shot.** The benchmark's Keyframes panel makes one image per segment; one per shot
  is a closer match to a storyboard and still lets a segment pick its first frame later. Video
  generation stays out of scope.
