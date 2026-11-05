# Contract: Remotion `StoryComposition` inputProps

- **Source of truth**: the Zod schema `StoryCompositionProps` in `packages/shared`. The
  `packages/compositions` package registers it through `<Composition schema={...}>`.
- **Consumers**: the browser `@remotion/player` in `apps/web`, and `renderMedia` in
  `apps/worker`. Both import the same component and the same schema.

## Two forms

1. **Canonical props**: stored in `Render.inputProps` and hashed for `inputPropsHash`. Assets
   appear only as IDs.
2. **Resolved props**: what the composition actually receives. They are the canonical props plus
   an `assetUrls` map, filled by the resolver for the current context (browser or worker, see
   research R9). `assetUrls` is never stored and never hashed.

```ts
// Shape (illustrative; Zod schema is authoritative)
type StoryCompositionProps = {
  schemaVersion: 1;
  width: number; height: number; fps: 24 | 25 | 30 | 60;
  durationInFrames: number;
  seed: number;                         // passed to Remotion random(seed-derived) only
  style: { palette: string[]; fontFamily: "Inter" | "Merriweather" | "JetBrainsMono" };
  tracks: Array<{
    id: string;
    kind: "VISUAL" | "OVERLAY_3D" | "TEXT" | "AUDIO";
    order: number;
    muted: boolean;
    clips: Array<{
      id: string;
      assetId: string | null;           // required unless kind === "TEXT"
      startFrame: number;
      durationInFrames: number;
      trimStartFrame: number;
      props: ClipProps;
    }>;
  }>;
  assetMedia?: Record<string, "image" | "video" | "audio">; // canonical: picks <Img> vs <OffthreadVideo>
  assetUrls?: Record<string, string>;   // resolved form only
};

type ClipProps = {
  text?: string;                        // TEXT tracks, ≤ 200 chars
  transform?: { x: number; y: number; scale: number; rotation: number }; // px, px, ×, deg
  opacity?: number;                     // 0–1
  fit?: "cover" | "contain";
  transitionIn?: { type: "fade" | "slide" | "wipe"; durationInFrames: number };
  transitionOut?: { type: "fade" | "slide" | "wipe"; durationInFrames: number };
  volume?: number;                      // AUDIO, 0–1
  color?: string;                       // TEXT, "#RRGGBB"
  background?: string;                  // TEXT, "#RRGGBB" solid fill behind the text
};
```

## Determinism rules (constitution II)

- The composition MUST NOT use `Math.random`, `Date`, `fetch`, or timers. All animation is
  derived from `useCurrentFrame()` and the props.
- Randomness comes only from Remotion `random(\`${seed}-${clipId}\`)`.
- Fonts are loaded from bundled files with `@remotion/fonts` `loadFont({ url: staticFile(...) })`.
  Google Fonts and any other remote loader are forbidden.
- Media is used through `<Img>`, `<OffthreadVideo>`, and `<Audio>`, with `src` set to
  `assetUrls[assetId]`. If the URL is missing, the composition throws, so a bad prop fails loudly
  instead of rendering blank.
- Builder: `buildCanonicalProps(project, tracks, clips)` in `packages/shared` is the only
  function that produces canonical props. The timeline UI and the render API both use it.
