import type { CSSProperties } from "react";
import { interpolate } from "remotion";
import type { ClipProps } from "@storyflow/shared/schemas";

// Frame-derived only (constitution II): no timers, no Date, no Math.random.

type Transition = NonNullable<ClipProps["transitionIn"]>;

function apply(t: Transition, progress: number, direction: "in" | "out"): CSSProperties {
  // progress: 0 = fully hidden, 1 = fully shown
  switch (t.type) {
    case "fade":
      return { opacity: progress };
    case "slide": {
      const offset = (1 - progress) * 100 * (direction === "in" ? 1 : -1);
      return { transform: `translateX(${offset}%)` };
    }
    case "wipe":
      return { clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` };
  }
}

/** Style for a clip at `frame` (relative to clip start). */
export function transitionStyle(props: ClipProps, frame: number, durationInFrames: number): CSSProperties {
  let style: CSSProperties = {};
  if (props.transitionIn) {
    const d = Math.min(props.transitionIn.durationInFrames, durationInFrames);
    const p = interpolate(frame, [0, d], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    if (p < 1) style = { ...style, ...apply(props.transitionIn, p, "in") };
  }
  if (props.transitionOut) {
    const d = Math.min(props.transitionOut.durationInFrames, durationInFrames);
    const p = interpolate(frame, [durationInFrames - d, durationInFrames], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    if (p < 1) style = { ...style, ...apply(props.transitionOut, p, "out") };
  }
  return style;
}

/** Shared transform/opacity from ClipProps. */
export function baseStyle(props: ClipProps): CSSProperties {
  const t = props.transform;
  return {
    opacity: props.opacity ?? 1,
    transform: t ? `translate(${t.x}px, ${t.y}px) scale(${t.scale}) rotate(${t.rotation}deg)` : undefined,
  };
}

/** Merge base + transition styles, combining transforms and multiplying opacity. */
export function clipStyle(props: ClipProps, frame: number, durationInFrames: number): CSSProperties {
  const base = baseStyle(props);
  const tr = transitionStyle(props, frame, durationInFrames);
  return {
    ...base,
    ...tr,
    opacity: (base.opacity as number) * ((tr.opacity as number | undefined) ?? 1),
    transform: [tr.transform, base.transform].filter(Boolean).join(" ") || undefined,
  };
}
