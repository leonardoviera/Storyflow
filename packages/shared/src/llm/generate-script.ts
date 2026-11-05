import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { Blender3dToolParams } from "../schemas/blender-tools";
import { StoryScript, StoryScriptJsonSchema } from "../schemas/story-script";
import { llm, type LocalModel } from "./client";
import { directorSystemPrompt, repairPrompt } from "./prompts";

export class ScriptValidationError extends Error {
  constructor(public readonly issues: string) {
    super(`The local model did not produce a valid script after repairs:\n${issues}`);
  }
}

const MAX_REPAIRS = 2;

function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

export interface GenerateScriptResult {
  script: StoryScript;
  droppedAsset3d: number;
}

export async function generateStoryScript(opts: {
  prompt: string;
  model: LocalModel;
  targetDurationSeconds?: number;
}): Promise<GenerateScriptResult> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: directorSystemPrompt(opts.targetDurationSeconds) },
    { role: "user", content: opts.prompt },
  ];

  let lastIssues = "";
  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    const completion = await llm().chat.completions.create({
      model: opts.model,
      messages,
      temperature: 0.7,
      response_format: {
        type: "json_schema",
        json_schema: { name: "StoryScript", schema: StoryScriptJsonSchema as Record<string, unknown>, strict: true },
      },
    });
    const content = completion.choices[0]?.message?.content ?? "";

    let json: unknown;
    try {
      json = JSON.parse(stripFences(content));
    } catch {
      lastIssues = "Response was not valid JSON.";
      messages.push({ role: "assistant", content }, { role: "user", content: repairPrompt(lastIssues) });
      continue;
    }

    const parsed = StoryScript.safeParse(json);
    if (parsed.success) {
      // Invalid 3D params drop that scene's asset3d instead of failing the whole script.
      let dropped = 0;
      for (const scene of parsed.data.scenes) {
        if (scene.asset3d && !Blender3dToolParams.safeParse(scene.asset3d).success) {
          delete scene.asset3d;
          dropped++;
        }
      }
      return { script: parsed.data, droppedAsset3d: dropped };
    }

    lastIssues = parsed.error.issues.map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    messages.push({ role: "assistant", content }, { role: "user", content: repairPrompt(lastIssues) });
  }
  throw new ScriptValidationError(lastIssues);
}
