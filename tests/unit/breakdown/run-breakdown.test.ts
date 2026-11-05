import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub the LiteLLM client: each call returns the next queued completion text.
const replies: string[] = [];
const create = vi.fn(async (_req: unknown) => ({ choices: [{ message: { content: replies.shift() ?? "" } }] }));
vi.mock("../../../packages/shared/src/llm/client", () => ({ llm: () => ({ chat: { completions: { create } } }) }));

const { runAnalyze, runEpisode, BreakdownStepError } = await import("../../../packages/shared/src/llm/run-breakdown");
const { parseScript, checkBreakdown } = await import("../../../packages/shared/src/breakdown");

const script = `INT. PADARIA - DIA
Ana entra.
ANA: Bom dia, Seu Antônio!
SEU ANTÔNIO: Bom dia, Dra. Lima.
EXT. RUA - NOITE
A rua está vazia.
ANA: Até amanhã.`;
const sourceLines = parseScript(script);
const settings = { aspectRatio: "PORTRAIT_9_16" as const, episodeSeconds: 30, episodeCount: 2 };

const analyze = {
  synopsis: { storyType: "drama", audience: "adultos", setting: "hoje", summary: "Ana compra pão.", characterProfiles: [{ assetRef: "c_ana", profile: "Médica." }] },
  assets: [
    { ref: "c_ana", type: "CHARACTER", name: "Ana", aliases: [], description: "", variants: [{ ref: "v1", name: "default", description: "" }] },
    // Same character under another name: merged by alias (FR-015).
    { ref: "c_lima", type: "CHARACTER", name: "Dra. Lima", aliases: ["Ana"], description: "", variants: [{ ref: "v2", name: "Jaleco", description: "" }] },
    { ref: "c_ant", type: "CHARACTER", name: "Seu Antônio", aliases: [], description: "", variants: [{ ref: "v3", name: "default", description: "" }] },
    { ref: "s_pad", type: "SETTING", name: "Padaria", aliases: [], description: "", variants: [{ ref: "v4", name: "Dia", description: "" }] },
    { ref: "s_rua", type: "SETTING", name: "Rua", aliases: [], description: "", variants: [{ ref: "v5", name: "Noite", description: "" }] },
  ],
  speakerMap: [
    { speakerHint: "ANA", assetRef: "c_ana" },
    { speakerHint: "SEU ANTÔNIO", assetRef: "c_ant" },
  ],
  episodePlan: { maxSensibleEpisodes: 2, episodes: [{ title: "Manhã", startLineId: "L1" }, { title: "Noite", startLineId: "L5" }] },
};

beforeEach(() => {
  replies.length = 0;
  create.mockClear();
});

describe("runAnalyze", () => {
  it("builds assets with real ids, merges aliases, maps speakers and sets episode ranges", async () => {
    replies.push(JSON.stringify(analyze));
    const { doc, speakerMap, maxSensibleEpisodes } = await runAnalyze({ sourceLines, settings, fixedAssets: [] });
    const characters = doc.assets.filter((a) => a.type === "CHARACTER");
    expect(characters.map((c) => c.name)).toEqual(["Ana", "Seu Antônio"]);
    expect(characters[0]!.aliases).toEqual(["Dra. Lima"]);
    expect(characters[0]!.variants.map((v) => v.name)).toEqual(["default", "Jaleco"]);
    expect(speakerMap.ANA).toBe(characters[0]!.id);
    expect(doc.episodes.map((e) => [e.sourceLineRange, e.status, e.targetFrames])).toEqual([
      [{ from: "L1", to: "L4" }, "pending", 900],
      [{ from: "L5", to: "L7" }, "pending", 900],
    ]);
    expect(maxSensibleEpisodes).toBe(2);
    expect(doc.synopsis.characterProfiles[0]!.assetId).toBe(characters[0]!.id);
  });

  it("repairs an unmapped speaker and out-of-order episode starts", async () => {
    const bad = { ...analyze, speakerMap: [analyze.speakerMap[0]], episodePlan: { ...analyze.episodePlan, episodes: [{ title: "x", startLineId: "L3" }] } };
    replies.push(JSON.stringify(bad), JSON.stringify(analyze));
    await runAnalyze({ sourceLines, settings, fixedAssets: [] });
    expect(create).toHaveBeenCalledTimes(2);
    const repair = (create.mock.calls[1]![0] as { messages: { content: string }[] }).messages.at(-1)!.content;
    expect(repair).toContain('speakerMap has no entry for speaker "SEU ANTÔNIO"');
    expect(repair).toContain("startLineId must be L1");
  });

  it("throws BreakdownStepError after two failed repairs", async () => {
    replies.push("not json", "not json", "not json");
    await expect(runAnalyze({ sourceLines, settings, fixedAssets: [] })).rejects.toBeInstanceOf(BreakdownStepError);
    expect(create).toHaveBeenCalledTimes(3);
  });
});

describe("runEpisode", () => {
  async function analyzed() {
    replies.push(JSON.stringify(analyze));
    return runAnalyze({ sourceLines, settings, fixedAssets: [] });
  }

  it("copies spoken text verbatim, downgrades bad 3D params and fits durations", async () => {
    const { doc, speakerMap } = await analyzed();
    const ana = doc.assets.find((a) => a.name === "Ana")!;
    const ant = doc.assets.find((a) => a.name === "Seu Antônio")!;
    const padaria = doc.assets.find((a) => a.name === "Padaria")!.variants[0]!;
    replies.push(
      JSON.stringify({
        segments: [
          {
            settingVariantId: padaria.id,
            shots: [
              {
                shotSize: "wide", camera: "static", action: `@{${ana.variants[0]!.id}} entra.`,
                spokenLineIds: [], actionLineIds: ["L1", "L2"], speakerByLine: [], sound: "sino",
                visual: { kind: "3d", tool: "render_text_logo", paramsJson: '{"text":""}' }, suggestedSeconds: 3,
              },
              {
                shotSize: "medium", camera: "static", action: "Os dois se cumprimentam.",
                spokenLineIds: ["L3", "L4"], actionLineIds: [],
                speakerByLine: [{ lineId: "L3", assetId: ana.id }, { lineId: "L4", assetId: ant.id }],
                sound: "", visual: { kind: "image" }, suggestedSeconds: 4,
              },
            ],
          },
        ],
      }),
    );
    const episode = await runEpisode({ doc, episode: doc.episodes[0]!, sourceLines, speakerMap });
    const shots = episode.segments.flatMap((s) => s.shots);
    // The silent opening shot takes the extra time and is split; the dialogue shot keeps its lines.
    const spoken = shots.find((s) => s.lines.length > 0)!;
    expect(spoken.lines.map((l) => [l.text, l.sourceLineId, l.kind])).toEqual([
      ["ANA: Bom dia, Seu Antônio!", "L3", "dialogue"],
      ["SEU ANTÔNIO: Bom dia, Dra. Lima.", "L4", "dialogue"],
    ]);
    expect(shots[0]!.visual.kind).toBe("image");
    expect(episode.status).toBe("done");
    const full = { ...doc, episodes: [episode, doc.episodes[1]!] };
    expect(checkBreakdown(full, sourceLines).errors).toEqual([]);
  });

  it("asks for a repair when lines are missing or a setting is wrong", async () => {
    const { doc, speakerMap } = await analyzed();
    const ana = doc.assets.find((a) => a.name === "Ana")!;
    const rua = doc.assets.find((a) => a.name === "Rua")!.variants[0]!;
    const shot = (spoken: string[], action: string[]) => ({
      shotSize: "wide", camera: "static", action: "", spokenLineIds: spoken, actionLineIds: action,
      speakerByLine: spoken.map((lineId) => ({ lineId, assetId: ana.id })), sound: "", visual: { kind: "none" }, suggestedSeconds: 5,
    });
    replies.push(
      JSON.stringify({ segments: [{ settingVariantId: ana.variants[0]!.id, shots: [shot(["L7"], ["L5"])] }] }),
      JSON.stringify({ segments: [{ settingVariantId: rua.id, shots: [shot(["L7"], ["L5", "L6"])] }] }),
    );
    const episode = await runEpisode({ doc, episode: doc.episodes[1]!, sourceLines, speakerMap });
    const repair = (create.mock.calls[2]![0] as { messages: { content: string }[] }).messages.at(-1)!.content;
    expect(repair).toContain("missing; put each in exactly one shot: L6");
    expect(repair).toContain("must be a variant id of a SETTING asset");
    expect(episode.segments[0]!.shots[0]!.lines[0]!.text).toBe("ANA: Até amanhã.");
  });
});
