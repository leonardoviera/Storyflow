import { Config } from "@remotion/cli/config";

// Constitution III: never exceed 4 render threads.
Config.setConcurrency(4);
Config.setVideoImageFormat("jpeg");
