import { StoryCompositionProps } from "../schemas/composition-props";

// The `reference` template: TEXT clips only (solid backgrounds), so it needs no asset files.
// Used by the seed, the determinism test and the offline smoke test.

export const REFERENCE_TEMPLATE_PROPS = StoryCompositionProps.parse({
  schemaVersion: 1,
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 150,
  seed: 42,
  style: { palette: ["#0F172A", "#F8FAFC", "#38BDF8"], fontFamily: "Inter" },
  assetMedia: {},
  tracks: [
    {
      id: "ref-track-text",
      kind: "TEXT",
      order: 0,
      muted: false,
      clips: [
        {
          id: "ref-clip-1",
          assetId: null,
          startFrame: 0,
          durationInFrames: 75,
          trimStartFrame: 0,
          props: {
            text: "StoryFlow",
            background: "#0F172A",
            color: "#F8FAFC",
            transitionIn: { type: "fade", durationInFrames: 15 },
          },
        },
        {
          id: "ref-clip-2",
          assetId: null,
          startFrame: 75,
          durationInFrames: 75,
          trimStartFrame: 0,
          props: {
            text: "100% local video",
            background: "#38BDF8",
            color: "#0F172A",
            transitionIn: { type: "slide", durationInFrames: 15 },
            transitionOut: { type: "fade", durationInFrames: 15 },
          },
        },
      ],
    },
  ],
});
