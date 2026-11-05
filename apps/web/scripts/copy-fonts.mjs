// The Player resolves staticFile("fonts/…") against the web app's /public.
import { cpSync } from "node:fs";
import { fileURLToPath } from "node:url";

const from = fileURLToPath(new URL("../../../packages/compositions/public/fonts", import.meta.url));
const to = fileURLToPath(new URL("../public/fonts", import.meta.url));
cpSync(from, to, { recursive: true });
