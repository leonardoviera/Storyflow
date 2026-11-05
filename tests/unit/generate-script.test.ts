import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub the LiteLLM client: each call returns the next queued completion text.
const replies: string[] = [];
const create = vi.fn(async () => ({ choices: [{ message: { content: replies.shift() ?? "" } }] }));
vi.mock("../../packages/shared/src/llm/client", () => ({ llm: () => ({ chat: { completions: { create } } }) }));

const { generateStoryScript, ScriptValidationError } = await import("../../packages/shared/src/llm/generate-script");

const valid = {
  schemaVersion: 1,
  title: "The Keeper and the Comet",
  logline: "A lonely lighthouse keeper befriends a comet.",
  fps: 30,
  scenes: [
    { title: "Night watch", narration: "The lamp turns.", visualPrompt: "lighthouse at night", durationSeconds: 5, transition: "fade" },
    {
      title: "Arrival",
      narration: "A streak of light.",
      visualPrompt: "comet over sea",
      durationSeconds: 6,
      asset3d: { tool: "render_text_logo", params: { text: "COMET" } },
    },
  ],
};

beforeEach(() => {
  replies.length = 0;
  create.mockClear();
});

describe("generateStoryScript", () => {
  it("accepts a valid StoryScript on the first try (fenced JSON tolerated)", async () => {
    replies.push("```json\n" + JSON.stringify(valid) + "\n```");
    const { script, droppedAsset3d } = await generateStoryScript({ prompt: "x", model: "local-llm" });
    expect(script.scenes).toHaveLength(2);
    expect(droppedAsset3d).toBe(0);
    expect(create).toHaveBeenCalledTimes(1);
    const call = create.mock.calls[0] as unknown as [{ model: string; response_format: { type: string } }];
    expect(call[0].model).toBe("local-llm");
    expect(call[0].response_format.type).toBe("json_schema");
  });

  it("repairs an invalid reply by sending the Zod issues back", async () => {
    replies.push(JSON.stringify({ ...valid, fps: 29 }), JSON.stringify(valid));
    const { script } = await generateStoryScript({ prompt: "x", model: "local-llm" });
    expect(script.fps).toBe(30);
    expect(create).toHaveBeenCalledTimes(2);
    const second = create.mock.calls[1] as unknown as [{ messages: { role: string; content: string }[] }];
    expect(second[0].messages.at(-1)!.content).toMatch(/fps/);
  });

  it("gives up after 2 repairs", async () => {
    replies.push("not json", "{}", "{}");
    await expect(generateStoryScript({ prompt: "x", model: "local-llm" })).rejects.toBeInstanceOf(ScriptValidationError);
    expect(create).toHaveBeenCalledTimes(3);
  });

  it("drops invalid asset3d params instead of failing the script", async () => {
    const bad = structuredClone(valid);
    bad.scenes[1]!.asset3d = { tool: "render_text_logo", params: { text: "x".repeat(41) } };
    replies.push(JSON.stringify(bad));
    const { script, droppedAsset3d } = await generateStoryScript({ prompt: "x", model: "local-llm" });
    expect(droppedAsset3d).toBe(1);
    expect(script.scenes[1]!.asset3d).toBeUndefined();
  });
});
