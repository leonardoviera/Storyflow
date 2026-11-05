// Deterministic render check (constitution II, Development Workflow gate).
// Renders frames 0 / mid / last of the `reference` template twice and compares SHA-256.
// Runs inside the worker image (pre-built bundle + baked browser, no network): `pnpm test:render`.
import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderStill, selectComposition } from "@remotion/renderer";
import { REFERENCE_TEMPLATE_PROPS } from "@storyflow/shared/reference";

const serveUrl = process.env.REMOTION_SERVE_URL ?? "/app/bundle";
const inputProps = REFERENCE_TEMPLATE_PROPS as unknown as Record<string, unknown>;
const last = REFERENCE_TEMPLATE_PROPS.durationInFrames - 1;
const frames = [0, Math.floor(last / 2), last];

async function hashFrame(frame: number, run: number): Promise<string> {
  const composition = await selectComposition({ serveUrl, id: "StoryComposition", inputProps });
  const output = join(tmpdir(), `determinism-${frame}-${run}.png`);
  await renderStill({ composition, serveUrl, frame, output, inputProps, imageFormat: "png", logLevel: "error" });
  const hash = createHash("sha256").update(await readFile(output)).digest("hex");
  await rm(output, { force: true });
  return hash;
}

let failed = false;
for (const frame of frames) {
  const a = await hashFrame(frame, 1);
  const b = await hashFrame(frame, 2);
  const ok = a === b;
  failed ||= !ok;
  console.log(`${ok ? "PASS" : "FAIL"} frame ${frame}: ${a.slice(0, 16)} ${ok ? "==" : "!="} ${b.slice(0, 16)}`);
}
console.log(failed ? "Determinism test FAILED" : "Determinism test passed");
process.exit(failed ? 1 : 0);
