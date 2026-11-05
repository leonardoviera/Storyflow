#!/usr/bin/env node
// Constitution config lint (v2.0.0 — Development Workflow & Quality Gates).
// Zero dependencies: line-based checks over compose, LiteLLM config, sources and manifests.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const violations = [];
const report = (file, line, rule, detail) =>
  violations.push(`${relative(root, file)}:${line} ${rule}${detail ? ` — ${detail}` : ""}`);

const lines = (file) => readFileSync(file, "utf8").split(/\r?\n/);

// 1 + 2. docker-compose.yml: pinned images, loopback-only ports.
const compose = join(root, "docker-compose.yml");
if (existsSync(compose)) {
  let inPorts = false;
  lines(compose).forEach((raw, i) => {
    const line = raw.replace(/\s+#.*$/, "");
    const image = line.match(/^\s*image:\s*["']?([^"'\s]+)/);
    if (image) {
      const ref = image[1];
      const local = ref.startsWith("storyflow/");
      const tag = ref.includes("@sha256:") ? "digest" : ref.split("/").pop().split(":")[1];
      if (!local && (!tag || ["latest", "main-latest", "main-stable", "stable"].includes(tag))) {
        report(compose, i + 1, "floating-image-tag", ref);
      }
    }
    if (/^\s*ports:\s*$/.test(line)) inPorts = true;
    else if (inPorts && /^\s*-\s*/.test(line)) {
      const port = line.replace(/^\s*-\s*/, "").replace(/["']/g, "");
      if (!port.startsWith("127.0.0.1:")) report(compose, i + 1, "non-loopback-port", port);
    } else if (inPorts && line.trim() !== "") inPorts = false;
  });
}

// 3. LiteLLM config: self-hosted backends only (constitution I, v2.0.0).
// Literal models must use a self-hosted provider; the only allowed api_key is the self-hosted
// server's own key from .env. An `openai/` model is only allowed via LLM_MODEL in .env, where
// check 3b guarantees a private api_base (without one, LiteLLM would call api.openai.com).
const litellm = join(root, "infra/litellm/config.yaml");
const selfHostedProviders = ["hosted_vllm", "lm_studio", "ollama", "ollama_chat", "llamafile", "openai"];
const literalProviders = selfHostedProviders.filter((p) => p !== "openai");
if (existsSync(litellm)) {
  lines(litellm).forEach((raw, i) => {
    const line = raw.replace(/\s+#.*$/, "");
    const key = line.match(/^\s*api_key\s*:\s*["']?([^"'\s]*)/);
    if (key && key[1] !== "os.environ/LLM_API_KEY") report(litellm, i + 1, "cloud-api-key");
    const model = line.match(/^\s*model:\s*["']?([^"'\s]+)/);
    if (model && model[1] !== "os.environ/LLM_MODEL" && !literalProviders.includes(model[1].split("/")[0])) {
      report(litellm, i + 1, "cloud-model", line.trim());
    }
    const base = line.match(/^\s*api_base:\s*["']?([^"'\s]+)/);
    if (base && base[1] !== "os.environ/LLM_API_BASE" && !isPrivateUrl(base[1])) {
      report(litellm, i + 1, "public-api-base", base[1]);
    }
  });
}

// 3b. .env.example and .env: LLM_MODEL uses a self-hosted provider; LLM_API_BASE is private.
function isPrivateUrl(value) {
  let host;
  try {
    host = new URL(value).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return false;
  }
  if (["localhost", "host.docker.internal", "::1"].includes(host)) return true;
  if (!host.includes(".") && !host.includes(":")) return true; // single-label LAN name
  if (/\.(local|lan|home\.arpa|internal)$/.test(host)) return true;
  const ip = host.split(".").map(Number);
  if (ip.length !== 4 || ip.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = ip;
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}
for (const file of [".env.example", ".env"].map((f) => join(root, f)).filter(existsSync)) {
  const vars = {};
  lines(file).forEach((raw, i) => {
    const m = raw.match(/^\s*(LLM_MODEL|LLM_API_BASE)\s*=\s*["']?([^"'\s#]*)/);
    if (m) vars[m[1]] = { value: m[2], line: i + 1 };
  });
  const model = vars.LLM_MODEL;
  if (!model || !selfHostedProviders.includes(model.value.split("/")[0])) {
    report(file, model?.line ?? 1, "cloud-model", `LLM_MODEL must use one of: ${selfHostedProviders.join(", ")}`);
  }
  const base = vars.LLM_API_BASE;
  if (!base || !isPrivateUrl(base.value)) {
    report(file, base?.line ?? 1, "public-api-base", `LLM_API_BASE must be a private address (got ${base?.value || "nothing"})`);
  }
}

// 4 + 5. Sources and manifests.
const skipDirs = new Set(["node_modules", ".next", "dist", "generated", "coverage", "public"]);
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skipDirs.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}
const secretLike =
  /(minioadmin|["']sk-[A-Za-z0-9-]{8,}["']|password\s*[:=]\s*["'][^"']+["'])/i;
const remoteFonts = /fonts\.(googleapis|gstatic)\.com/;
for (const dir of ["apps", "packages"].map((d) => join(root, d)).filter(existsSync)) {
  for (const file of walk(dir)) {
    if (/\.(ts|tsx|js|mjs|cjs)$/.test(file)) {
      lines(file).forEach((line, i) => {
        if (secretLike.test(line)) report(file, i + 1, "hardcoded-credential");
        if (remoteFonts.test(line)) report(file, i + 1, "remote-font");
      });
    }
  }
}
const manifests = [join(root, "package.json")];
for (const dir of ["apps", "packages"].map((d) => join(root, d)).filter(existsSync)) {
  for (const file of walk(dir)) if (file.endsWith("package.json")) manifests.push(file);
}
for (const file of manifests) {
  lines(file).forEach((line, i) => {
    const m = line.match(/^\s*"([^"]+)":\s*"([\^~][^"]*)"/);
    if (m) report(file, i + 1, "unpinned-version", `${m[1]}@${m[2]}`);
  });
}

if (violations.length) {
  console.error(`Constitution config lint failed (${violations.length}):`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log("Constitution config lint passed.");
