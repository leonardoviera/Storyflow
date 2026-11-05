import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  serverExternalPackages: ["pg-boss", "@prisma/client", "@prisma/adapter-pg", "pg", "@remotion/media-parser"],
  transpilePackages: [
    "@storyflow/shared",
    "@storyflow/db",
    "@storyflow/storage",
    "@storyflow/compositions",
  ],
};

export default config;
