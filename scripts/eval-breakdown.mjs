#!/usr/bin/env node
// Breakdown evaluation (spec 002, research R14). Manual: it needs the compose stack and the LAN LLM.
// Zero dependencies; talks to the web API only.
//
//   node scripts/eval-breakdown.mjs --check-verbatim <projectId> <version>
//     SC-003: every dialogue source line is used exactly once, with identical text, and no spoken
//     line is invented. SC-004: shots add up to segments, segments are 4–15 s.
//
//   node scripts/eval-breakdown.mjs <fixturesDir> [--episodes N] [--seconds S]
//     Runs every fixture script through a new project and prints character and location recall
//     against <name>.expected.json, the duplicate rate (SC-005) and the timings (SC-002).
/* global fetch, setTimeout */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { basename, extname, join } from "node:path";

const BASE = process.env.STORYFLOW_URL ?? "http://127.0.0.1:3001";
const FPS = 30;

async function api(path, init = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${data.error ?? ""}`);
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function checkVerbatim(b) {
  const problems = [];
  const source = new Map(b.sourceLines.map((l) => [l.id, l]));
  const used = new Map();
  let spoken = 0;
  let exact = 0;
  b.document.episodes.forEach((ep, ei) => {
    if (ep.status !== "done") problems.push(`episode ${ei + 1} is ${ep.status}`);
    let episodeFrames = 0;
    ep.segments.forEach((seg, si) => {
      const where = `episode ${ei + 1} segment ${si + 1}`;
      const sum = seg.shots.reduce((n, s) => n + s.durationInFrames, 0);
      if (sum !== seg.durationInFrames) problems.push(`${where}: shots add up to ${sum}, segment says ${seg.durationInFrames}`);
      if (seg.durationInFrames < 4 * FPS || seg.durationInFrames > 15 * FPS) {
        problems.push(`${where}: ${(seg.durationInFrames / FPS).toFixed(1)} s is outside 4–15 s`);
      }
      episodeFrames += seg.durationInFrames;
      for (const shot of seg.shots) {
        for (const line of shot.lines) {
          spoken++;
          const src = line.sourceLineId && source.get(line.sourceLineId);
          if (!src) {
            problems.push(`${where}: spoken line "${line.text.slice(0, 40)}" has no source line`);
            continue;
          }
          used.set(src.id, (used.get(src.id) ?? 0) + 1);
          if (src.text === line.text) exact++;
          else problems.push(`${where}: ${src.id} text differs from the script`);
        }
      }
    });
    void episodeFrames;
  });
  for (const line of b.sourceLines) {
    if (line.hint !== "dialogue") continue;
    const n = used.get(line.id) ?? 0;
    if (n !== 1) problems.push(`${line.id} (dialogue) is spoken ${n} times`);
  }
  return { problems, spoken, exact };
}

async function checkVerbatimCommand(projectId, version) {
  const b = await api(`/projects/${projectId}/breakdowns/${version}`);
  const { problems, spoken, exact } = checkVerbatim(b);
  console.log(`spoken lines: ${spoken}, verbatim: ${exact} (${spoken ? ((100 * exact) / spoken).toFixed(1) : "100.0"}%)`);
  if (problems.length) {
    console.log(`${problems.length} problem(s):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
  console.log("OK: dialogue verbatim and durations exact (SC-003, SC-004)");
}

const norm = (s) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Recall and duplicates of produced assets against an expected list. */
function score(expected, assets) {
  const characters = assets.filter((a) => a.type === "CHARACTER");
  const settings = assets.filter((a) => a.type === "SETTING");
  const namesOf = (a) => [a.name, ...a.aliases].map(norm);
  let found = 0;
  let duplicates = 0;
  for (const c of expected.characters) {
    const keys = [c.name, ...c.aliases].map(norm);
    const matches = characters.filter((a) => namesOf(a).some((n) => keys.includes(n)));
    if (matches.length > 0) found++;
    if (matches.length > 1) duplicates += matches.length - 1;
  }
  let locations = 0;
  for (const loc of expected.locations) {
    const key = norm(loc);
    if (settings.some((s) => namesOf(s).some((n) => n.includes(key) || key.includes(n)))) locations++;
  }
  return {
    characterRecall: expected.characters.length ? found / expected.characters.length : 1,
    locationRecall: expected.locations.length ? locations / expected.locations.length : 1,
    duplicateRate: characters.length ? duplicates / characters.length : 0,
  };
}

async function runFixture(file, episodes, seconds) {
  const name = basename(file, extname(file));
  const project = await api("/projects", { method: "POST", json: { title: `eval ${name} ${new Date().toISOString()}`, start: "script" } });
  const script = await api(`/projects/${project.id}/script`);
  const text = readFileSync(file, "utf8");
  await api(`/projects/${project.id}/script`, {
    method: "PUT",
    json: { baseRevision: script.revision, text, aspectRatio: "PORTRAIT_9_16", episodeSeconds: seconds, episodeCount: episodes },
  });
  const started = Date.now();
  const { jobId, version } = await api(`/projects/${project.id}/breakdowns`, { method: "POST" });
  let job;
  for (;;) {
    job = await api(`/jobs/${jobId}`);
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job.status)) break;
    await sleep(2000);
  }
  const ms = Date.now() - started;
  const b = await api(`/projects/${project.id}/breakdowns/${version}`);
  return { name, projectId: project.id, version, status: b.status, job: job.status, error: job.error, ms, breakdown: b };
}

async function directoryCommand(dir, episodes, seconds) {
  const files = readdirSync(dir).filter((f) => /\.(md|txt)$/.test(f)).map((f) => join(dir, f));
  const rows = [];
  for (const file of files) {
    process.stdout.write(`${basename(file)} … `);
    const r = await runFixture(file, episodes, seconds);
    const expectedFile = file.replace(/\.(md|txt)$/, ".expected.json");
    const s = existsSync(expectedFile) ? score(JSON.parse(readFileSync(expectedFile, "utf8")), r.breakdown.document.assets) : null;
    const v = checkVerbatim(r.breakdown);
    rows.push({ ...r, score: s, verbatim: v });
    console.log(`${r.status} in ${(r.ms / 1000).toFixed(0)} s${r.error ? ` (${r.error})` : ""}`);
  }
  console.log("\nfixture        status   time   chars  locs   dups   verbatim  problems  project/version");
  for (const r of rows) {
    const pct = (x) => (x === undefined ? "  -  " : `${(100 * x).toFixed(0).padStart(3)}%`);
    console.log(
      [
        r.name.padEnd(14),
        r.status.padEnd(8),
        `${(r.ms / 1000).toFixed(0)}s`.padStart(5),
        pct(r.score?.characterRecall).padStart(6),
        pct(r.score?.locationRecall).padStart(6),
        pct(r.score?.duplicateRate).padStart(6),
        `${r.verbatim.exact}/${r.verbatim.spoken}`.padStart(9),
        String(r.verbatim.problems.length).padStart(9),
        ` ${r.projectId}/${r.version}`,
      ].join(" "),
    );
  }
}

const args = process.argv.slice(2);
const opt = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
if (args[0] === "--check-verbatim" && args[1] && args[2]) {
  await checkVerbatimCommand(args[1], Number(args[2]));
} else if (args[0] && !args[0].startsWith("--")) {
  await directoryCommand(args[0], opt("--episodes", 1), opt("--seconds", 60));
} else {
  console.log("usage: eval-breakdown.mjs --check-verbatim <projectId> <version> | <fixturesDir> [--episodes N] [--seconds S]");
  process.exit(2);
}
