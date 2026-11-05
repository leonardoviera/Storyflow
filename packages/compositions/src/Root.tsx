import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { StoryCompositionProps } from "@storyflow/shared/schemas";
import { REFERENCE_TEMPLATE_PROPS } from "./reference-props";
import { StoryComposition } from "./StoryComposition";

// Props are validated with Zod here rather than via <Composition schema>, because Remotion's
// schema editor targets Zod v3 and this project pins Zod v4.
const calculateMetadata: CalculateMetadataFunction<StoryCompositionProps> = ({ props }) => {
  const parsed = StoryCompositionProps.parse(props);
  return {
    props: parsed,
    width: parsed.width,
    height: parsed.height,
    fps: parsed.fps,
    durationInFrames: parsed.durationInFrames,
  };
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="StoryComposition"
    component={StoryComposition}
    defaultProps={REFERENCE_TEMPLATE_PROPS}
    calculateMetadata={calculateMetadata}
    width={1920}
    height={1080}
    fps={30}
    durationInFrames={150}
  />
);
