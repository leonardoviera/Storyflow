# Quickstart: Validating Script-First Breakdown

These checks show that feature 002 works once it is built. The interfaces are in
[contracts/](./contracts/) and the entities in [data-model.md](./data-model.md).

## Prerequisites

- The 001 stack is running and healthy (001 quickstart, Checks 1–2). The web app is at
  `http://127.0.0.1:${WEB_HOST_PORT}` (3001 on this machine), and LiteLLM's `local-llm` serves
  `ollama_chat/gpt-oss:20b` on the LAN server.
- `docker compose up -d --build` after the migration that adds the 002 tables. `db-migrate` must
  exit 0.
- The fixture scripts are in `tests/fixtures/scripts/` (research R14):
  - `padaria.md`: pt-BR screenplay, about 1,500 words, 3 locations;
  - `farol.txt`: prose narration with no dialogue;
  - `startup.docx`: English, `NAME:` dialogue;
  - `familia.md`: dash dialogue, aliases such as "Mãe", "Dona Rosa" and "Rosa";
  - `serie-ep.md`: names the character "Ana Lima", for the library check.

Set `BASE=http://127.0.0.1:3001`.

## Check A1: Unit and contract tests (no LLM needed)

```bash
corepack pnpm test           # vitest: tests/unit/breakdown/**, contract tests
node scripts/lint-config.mjs # still exit 0 (no new service, no new endpoint)
```

**Expected**: everything passes. In particular:
- `fitDurations`: sums are exact and every segment is 4–15 s;
- coverage: missing and duplicated line ids are detected;
- `buildEpisodeTimeline`: the length equals the sum of the shots, and there is one text clip per
  line;
- `validateTimeline` accepts placeholders;
- the frame-hash test passes, including the new placeholder reference.

## Check A2: Script-first project and upload (US1, FR-001/002/005)

1. In the UI, click **New project**. **Expected**: you land on `/projects/{id}/script`, not the
   editor.
2. Upload `startup.docx`. **Expected**: the extracted text shows for review, along with the word
   count. Accept it, reload the page, and the text is still there.
3. Upload a `.pdf`, a file over 10 MB and a non-UTF-8 `.txt`. **Expected**: a 422 or 413 with a
   message that names the problem, and the script area is unchanged.

## Check A3: Breakdown (US1, FR-006..012, SC-002/003/004)

Paste `padaria.md`. Choose 9:16, 60 s and 2 episodes, then click **Start breakdown**, or call:

```bash
curl -s -X POST $BASE/api/projects/$P/breakdowns
```

**Expected**:
- The progress shows `analyze`, then episode 1, then episode 2, and the queue position while it
  waits.
- The whole run takes under 3 min per 60 s episode.
- The result has a synopsis, the asset bible and 2 episodes.
- `GET …/breakdowns/1` returns no `SEGMENT_DURATION` flags, every segment has one setting, and the
  shot sums are exact (SC-004).
- **Verbatim**: `node scripts/eval-breakdown.mjs --check-verbatim $P 1` reports 100% of the
  dialogue lines matched and each one used once (SC-003).

## Check A4: Failure paths (edge cases, FR-011)

1. Stop the LLM server, or point `LLM_API_BASE` at an unused port and restart `litellm`. Start a
   breakdown. **Expected**: a readable "AI server unavailable" error, and the script is kept.
2. Start a breakdown of 3 episodes and cancel it after episode 1. **Expected**: the breakdown is
   `CANCELLED`, episode 1 is kept, and episodes 2 and 3 can be retried one by one.
3. Paste `farol.txt` (no dialogue). **Expected**: the shots carry narration lines and no flags
   about missing dialogue.
4. Ask for 10 episodes from a 200-word script. **Expected**: the response proposes a smaller
   number with a reason.

## Check A5: Generate from an idea (US2)

Switch to **Generate from an idea**, enter three sentences in Portuguese and choose 1 × 45 s.

**Expected**:
- A screenplay in Portuguese appears and can be edited.
- Edit one line and start the breakdown. Breakdown v1 contains the edited line, not the
  original.

## Check A6: Review and asset bible (US3, FR-013..021)

On the breakdown from A3:
1. Rename "Ana" to "Ana Lima". **Expected**: every shot shows `@Ana Lima·…`.
2. Delete a prop that is mentioned. **Expected**: the confirmation states N shots. After you
   confirm, those mentions show as missing, and **Build timeline** is blocked with their paths.
3. Lengthen a shot so its segment goes over 15 s. **Expected**: a `SEGMENT_DURATION` flag with an
   offer to split.
4. Type `@pa` in a shot. **Expected**: a filtered list that includes `Padaria·interior`.
5. Split a shot, merge two segments that share a setting, and move a shot. Undo 3 times, then
   reload. **Expected**: the state after the undos is the one that was saved.
6. `familia.md`: "Mãe", "Dona Rosa" and "Rosa" become one character with aliases.

## Check A7: Build the timeline (US4, FR-023..028, SC-006)

Fix the flags from A6-2, then build episode 1.

**Expected**:
- The editor opens on the episode project at 1080×1920.
- The length equals the episode's sum of shots exactly.
- Every dialogue line is a timed lower-third text clip.
- Image shots show labelled slates.
- Shots marked 3D start `asset3d.render` jobs, and each overlay lands on its shot's range.

Then:
1. Upload an image into one placeholder with **Apply to same setting**. **Expected**: every
   placeholder for that setting variant shows the image, and the variant now lists it as a
   reference image.
2. Move one clip by hand, then rebuild. **Expected**: a `409 HAND_EDITS` warning. After you
   confirm, a snapshot is listed and restoring it brings back the hand edit.
3. Render the episode. **Expected**: an MP4 like in 001, with any unfilled slates rendered as
   slates.

## Check A8: Library (US5, FR-029/030, SC-008)

1. Save "Ana Lima" from project A to the library, including a reference image.
2. Create project B, import "Ana Lima" before the breakdown and paste `serie-ep.md`.
   **Expected**: the shots mention the imported asset and no second "Ana" is created.
3. Edit the copy in B. **Expected**: the library entry is unchanged until you click **Update
   library**.

## Check A9: Export (FR-022)

`GET …/breakdowns/1/export?format=md`, `?format=html` and `?format=json&episode=<id>`.

**Expected**:
- `md`/`html` give a readable shot list with every field and the mentions resolved to names.
- `json` passes `BreakdownDocument` validation.

## Check A10: Reference set and offline (SC-005, constitution gate)

```bash
node scripts/eval-breakdown.mjs tests/fixtures/scripts   # needs the LAN LLM server
bash scripts/offline-smoke.sh                            # internet uplink off, LAN up
```

**Expected**:
- `eval-breakdown` reports at least 90% recall for characters and locations, fewer than 10%
  duplicates and 100% verbatim.
- The offline smoke test passes, and a breakdown still runs with the internet disconnected.

Record the results in `specs/002-script-first-breakdown/checklists/validation.md`.
