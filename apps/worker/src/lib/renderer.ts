import { renderMedia, selectComposition, type CancelSignal } from "@remotion/renderer";
import type { StoryCompositionProps } from "@storyflow/shared/schemas";
import { getEnv } from "@storyflow/shared/env";

/** Constitution III: never more than 4 render threads, whatever the env says. */
export const MAX_RENDER_THREADS = 4;

export interface RenderVideoOptions {
  compositionId: string;
  inputProps: StoryCompositionProps;
  outPath: string;
  onProgress: (progress: number) => void;
  cancelSignal?: CancelSignal;
}

export async function renderVideo(opts: RenderVideoOptions) {
  const env = getEnv();
  // Pre-built bundle baked into the image (research.md R5) — bundle() is never called at runtime.
  const serveUrl = env.REMOTION_SERVE_URL;
  if (!serveUrl) throw new Error("REMOTION_SERVE_URL is not set");
  const inputProps = opts.inputProps as unknown as Record<string, unknown>;

  const composition = await selectComposition({ serveUrl, id: opts.compositionId, inputProps });
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: opts.outPath,
    inputProps,
    concurrency: Math.min(env.RENDER_CONCURRENCY, MAX_RENDER_THREADS),
    onProgress: ({ progress }) => opts.onProgress(progress),
    cancelSignal: opts.cancelSignal,
    logLevel: "warn",
  });
  return composition;
}
