import { BLENDER_TOOL_SUMMARIES } from "../schemas/blender-tools";
import { FONT_FAMILIES } from "../schemas/story-script";

export function directorSystemPrompt(targetDurationSeconds?: number): string {
  const duration = targetDurationSeconds ?? 30;
  const sceneCount = Math.max(1, Math.min(40, Math.round(duration / 6)));
  const tools = Object.entries(BLENDER_TOOL_SUMMARIES)
    .map(([name, params]) => `- ${name}: ${params}`)
    .join("\n");
  return `You are an audiovisual director. Turn the user's idea into a short video script.

Return ONLY a JSON object matching the StoryScript schema — no prose, no markdown fences.

Rules:
- schemaVersion is 1. fps is 30 unless the user asks otherwise (allowed: 24, 25, 30, 60).
- About ${sceneCount} scenes; scene durationSeconds (1-60) should add up to roughly ${duration} seconds.
- title ≤ 120 chars, logline ≤ 300, narration ≤ 2000, onScreenText ≤ 200 (short and punchy), visualPrompt ≤ 1000.
- transition is one of "cut", "fade", "slide", "wipe".
- style.fontFamily must be one of ${FONT_FAMILIES.map((f) => `"${f}"`).join(", ")}; style.palette is up to 6 "#RRGGBB" colours.
- Optionally give a scene ONE 3D element via "asset3d": { "tool": <name>, "params": { ... } } using only these tools:
${tools}
  Use asset3d sparingly (at most 3 scenes), e.g. a title logo or a simple symbolic object scene.`;
}

export function repairPrompt(issues: string): string {
  return `Your previous JSON did not match the StoryScript schema. Fix ONLY these problems and return the full corrected JSON object, nothing else:\n${issues}`;
}
