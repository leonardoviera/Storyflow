"use client";

import { countWords } from "@storyflow/shared/breakdown";
import type { SaveState } from "@/hooks/useScript";

const MAX_WORDS = 50_000;

const SAVE_LABEL: Record<SaveState, string> = { saved: "Saved", saving: "Saving…", error: "Not saved" };

/** The script text with a live word count and the autosave status (FR-002, FR-005). */
export function ScriptInput({
  text,
  onChange,
  saveState,
  saveError,
}: {
  text: string;
  onChange: (text: string) => void;
  saveState: SaveState;
  saveError: string | null;
}) {
  const words = countWords(text);
  const over = words > MAX_WORDS;
  return (
    <div className="flex flex-1 flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder={"Paste your script here.\n\nINT. BAKERY - DAY\nAna walks in.\nANA: Good morning!"}
        spellCheck={false}
        className="min-h-[60vh] w-full flex-1 resize-y rounded border border-slate-800 bg-slate-950 p-4 font-mono text-sm leading-relaxed"
      />
      <div className="flex justify-between text-xs">
        <span className={over ? "text-red-400" : "text-slate-400"}>
          {words.toLocaleString()} / {MAX_WORDS.toLocaleString()} words
          {over && " — over the limit, the script will not be saved"}
        </span>
        <span className={saveState === "error" ? "text-red-400" : "text-slate-500"} title={saveError ?? undefined}>
          {SAVE_LABEL[saveState]}
        </span>
      </div>
    </div>
  );
}
