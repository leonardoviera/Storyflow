import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Self-hosted fonts only (constitution I: no remote font loaders).

const FILES = {
  Inter: ["Inter-Regular.woff2", "Inter-Bold.woff2"],
  Merriweather: ["Merriweather-Regular.woff2", "Merriweather-Bold.woff2"],
  JetBrainsMono: ["JetBrainsMono-Regular.woff2", "JetBrainsMono-Bold.woff2"],
} as const;

let loading: Promise<unknown> | undefined;

export function ensureFontsLoaded(): Promise<unknown> {
  loading ??= Promise.all(
    Object.entries(FILES).flatMap(([family, [regular, bold]]) => [
      loadFont({ family, url: staticFile(`fonts/${regular}`), weight: "400" }),
      loadFont({ family, url: staticFile(`fonts/${bold}`), weight: "700" }),
    ]),
  );
  return loading;
}
