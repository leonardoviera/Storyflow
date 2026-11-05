import type { Episode, Segment, Shot, SpokenLine } from "./document";
import { countWords } from "./parse-script";

// Deterministic duration fitter (R4). The model only suggests seconds per shot (already converted
// to frames in shot.durationInFrames); this sets the real integer frame counts so that shots sum
// to their segment and segments to the episode, every segment is 4–15 s and spoken lines fit.

export const MIN_SHOT_FRAMES = 30;
export const MIN_SEGMENT_FRAMES = 120;
export const MAX_SEGMENT_FRAMES = 450;
const WORDS_PER_SECOND = 2.5;
const LINE_PADDING_SECONDS = 0.3;
const FPS = 30;

/** Working shot with a real-valued duration. */
interface WShot {
  shot: Shot;
  floor: number;
  frames: number;
}
interface WSegment {
  segment: Segment;
  shots: WShot[];
}

function lineWords(lines: SpokenLine[]): number {
  return lines.reduce((n, l) => n + countWords(l.text), 0);
}

export function shotFloorFrames(lines: SpokenLine[]): number {
  const words = lineWords(lines);
  if (words === 0) return MIN_SHOT_FRAMES;
  return Math.max(MIN_SHOT_FRAMES, Math.ceil((words / WORDS_PER_SECOND + LINE_PADDING_SECONDS) * FPS));
}

/** Ids for shots/segments created by splits: derived from the parent id, never colliding. */
function idMaker(episode: Episode): (parentId: string) => string {
  const used = new Set<string>();
  for (const seg of episode.segments) {
    used.add(seg.id);
    for (const shot of seg.shots) used.add(shot.id);
  }
  return (parentId) => {
    const base = parentId.slice(0, 9).padEnd(9, "x");
    for (let n = 1; ; n++) {
      const id = base + n.toString(36).padStart(3, "0");
      if (!used.has(id)) {
        used.add(id);
        return id;
      }
    }
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const segFrames = (s: WSegment) => sum(s.shots.map((x) => x.frames));

/** Integers that add up to `total`, each the floor or ceiling of its real value. */
function largestRemainder(values: number[], total: number): number[] {
  // The epsilon keeps values like 119.99999… (from padding) on the integer they mean.
  const floors = values.map((v) => Math.floor(v + 1e-9));
  let remainder = total - sum(floors);
  const order = values
    .map((v, i) => ({ i, frac: Math.max(0, v - floors[i]!) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i]! += 1;
    remainder -= 1;
  }
  return floors;
}

/** Split one shot's lines in two, as close to half the words as possible. */
function splitLines(lines: SpokenLine[]): [SpokenLine[], SpokenLine[]] {
  if (lines.length <= 1) return [lines, []];
  const total = lineWords(lines);
  let best = 1;
  let bestDiff = Infinity;
  let acc = 0;
  for (let i = 1; i < lines.length; i++) {
    acc += countWords(lines[i - 1]!.text);
    const diff = Math.abs(acc - total / 2);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return [lines.slice(0, best), lines.slice(best)];
}

function splitLongShot(w: WShot, makeId: (p: string) => string): WShot[] {
  if (w.frames <= MAX_SEGMENT_FRAMES) return [w];
  const [linesA, linesB] = splitLines(w.shot.lines);
  const floorA = shotFloorFrames(linesA);
  const floorB = shotFloorFrames(linesB);
  // Each half gets its own 0.3 s line padding, so a shot at its floor grows by a few frames.
  const total = Math.max(w.frames, floorA + floorB);
  // A single line too long for 15 s cannot be split: keep it and let the validator flag it.
  if (linesB.length === 0 && w.shot.lines.length > 0 && floorA > MAX_SEGMENT_FRAMES) return [w];
  const ratio = lineWords(w.shot.lines) > 0 ? lineWords(linesA) / lineWords(w.shot.lines) : 0.5;
  let framesA = Math.max(floorA, total * ratio);
  if (total - framesA < floorB) framesA = total - floorB;
  const a: WShot = { shot: { ...w.shot, lines: linesA }, floor: floorA, frames: framesA };
  const b: WShot = {
    shot: { ...w.shot, id: makeId(w.shot.id), lines: linesB, continued: true },
    floor: floorB,
    frames: total - framesA,
  };
  if (a.frames >= w.frames) return [w]; // no progress: stop instead of recursing forever
  return [...splitLongShot(a, makeId), ...splitLongShot(b, makeId)];
}

/** Cut a long segment at shot boundaries into balanced groups of at most 450 frames. */
function splitLongSegment(s: WSegment, makeId: (p: string) => string): WSegment[] {
  const total = segFrames(s);
  if (total <= MAX_SEGMENT_FRAMES || s.shots.length < 2) return [s];
  const goal = total / Math.ceil(total / MAX_SEGMENT_FRAMES);
  const groups: WShot[][] = [[]];
  let acc = 0;
  for (const shot of s.shots) {
    const group = groups[groups.length - 1]!;
    if (group.length > 0 && (acc + shot.frames > MAX_SEGMENT_FRAMES || acc >= goal)) {
      groups.push([shot]);
      acc = shot.frames;
    } else {
      group.push(shot);
      acc += shot.frames;
    }
  }
  return groups.map((shots, i) => ({
    segment: { ...s.segment, id: i === 0 ? s.segment.id : makeId(s.segment.id) },
    shots,
  }));
}

function mergeOrPadShort(segments: WSegment[]): WSegment[] {
  const out = segments.slice();
  for (let i = 0; i < out.length; i++) {
    const s = out[i]!;
    const frames = segFrames(s);
    if (frames >= MIN_SEGMENT_FRAMES) continue;
    const fits = (n: WSegment | undefined) =>
      n && n.segment.settingVariantId === s.segment.settingVariantId && segFrames(n) + frames <= MAX_SEGMENT_FRAMES;
    const prev = out[i - 1];
    const next = out[i + 1];
    if (fits(prev)) {
      prev!.shots.push(...s.shots);
      out.splice(i, 1);
      i -= 1; // the merged segment may itself still be short
    } else if (fits(next)) {
      next!.shots.unshift(...s.shots);
      out.splice(i, 1);
      i -= 1;
    } else {
      // Pad every shot proportionally up to exactly 4 s.
      const k = MIN_SEGMENT_FRAMES / frames;
      for (const w of s.shots) w.frames *= k;
    }
  }
  return out;
}

/**
 * Pure and deterministic: the same episode and target always give the same result.
 * Returns a new episode; the input is not mutated.
 */
export function fitDurations(episode: Episode, targetFrames: number): Episode {
  const makeId = idMaker(episode);

  // 1. Floors from spoken words; suggested durations never go under them.
  let segments: WSegment[] = episode.segments.map((segment) => ({
    segment,
    shots: segment.shots.map((shot) => {
      const floor = shotFloorFrames(shot.lines);
      return { shot, floor, frames: Math.max(floor, shot.durationInFrames) };
    }),
  }));

  // 2. Scale the non-dialogue time (frames above the floor) toward the target.
  const all = segments.flatMap((s) => s.shots);
  const floorTotal = sum(all.map((w) => w.floor));
  const slackTotal = sum(all.map((w) => w.frames - w.floor));
  if (all.length > 0 && targetFrames > 0) {
    if (slackTotal > 0) {
      const k = Math.max(0, (targetFrames - floorTotal) / slackTotal);
      for (const w of all) w.frames = w.floor + (w.frames - w.floor) * k;
    } else if (targetFrames > floorTotal) {
      const k = targetFrames / floorTotal;
      for (const w of all) w.frames = w.floor * k;
    }
  }

  // 3. Split long shots, then long segments.
  for (const s of segments) s.shots = s.shots.flatMap((w) => splitLongShot(w, makeId));
  segments = segments.flatMap((s) => splitLongSegment(s, makeId));

  // 4. Merge or pad short segments.
  segments = mergeOrPadShort(segments);

  // 5. Whole frames with exact sums: episode → segments → shots.
  const segReal = segments.map(segFrames);
  const episodeTotal = Math.round(sum(segReal));
  const segInts = largestRemainder(segReal, episodeTotal);
  const fitted: Segment[] = segments.map((s, si) => {
    const shotInts = largestRemainder(
      s.shots.map((w) => w.frames),
      segInts[si]!,
    );
    return {
      ...s.segment,
      order: si + 1,
      durationInFrames: segInts[si]!,
      shots: s.shots.map((w, i) => ({ ...w.shot, order: i + 1, durationInFrames: shotInts[i]! })),
    };
  });

  // 6. Length warning beyond 20 % of the target.
  const lengthWarning = targetFrames > 0 && Math.abs(episodeTotal - targetFrames) > 0.2 * targetFrames;
  return { ...episode, segments: fitted, lengthWarning };
}
