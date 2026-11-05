import type { SourceLine, SourceLineHint } from "./document";

// Deterministic script → numbered source lines (R2). The hints only steer the model, which
// confirms or fixes them; the text of each line is what the breakdown copies verbatim (R1).

const HEADING = /^(?:(?:INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|I\/E|INT|EXT)\.?(?:\s|$)|CENA\s+\d+|#{1,6}\s)/;
const PARENTHETICAL = /^\(.*\)$/;
const DASH = /^[—–-]\s*\S/;
const TRANSITION = /^(?:FADE (?:IN|OUT)|CUT TO|DISSOLVE TO|SMASH CUT)|TO:$/;
// Fountain title page keys look like `NAME: text` but are not dialogue.
const TITLE_PAGE_KEYS = new Set(["title", "credit", "author", "authors", "source", "draft date", "contact", "copyright", "notes"]);
const SPEECH_VERBS =
  /\b(?:disse|diz|dizia|perguntou|pergunta|respondeu|responde|gritou|grita|sussurrou|sussurra|falou|fala|said|says|asked|asks|replied|replies|shouted|shouts|whispered|whispers)\b/i;
const QUOTE_OPEN = /^["“«]/;

/** One word of a speaker name: title case ("Dona", "Dra.") or all caps ("ANA"). */
const NAME_WORD = "\\p{Lu}[\\p{L}'.-]*";
const NAME_COLON = new RegExp(`^(${NAME_WORD}(?:\\s+${NAME_WORD}){0,3})\\s*:\\s+(\\S.*)$`, "u");
const UPPER_LETTER = /\p{Lu}/u;
const LOWER_LETTER = /\p{Ll}/u;

function isFountainCharacter(line: string): boolean {
  const name = line.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (!name || !UPPER_LETTER.test(name) || LOWER_LETTER.test(name)) return false;
  if (HEADING.test(line) || TRANSITION.test(line) || /[:!?]$/.test(name)) return false;
  return name.split(/\s+/).length <= 4;
}

function speakerName(line: string): string {
  return line.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

export function parseScript(text: string): SourceLine[] {
  const raw = text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim());
  const out: SourceLine[] = [];
  const push = (lineText: string, hint: SourceLineHint, speakerHint?: string) => {
    out.push({ id: `L${out.length + 1}`, text: lineText, hint, ...(speakerHint ? { speakerHint } : {}) });
  };

  let speaker: string | undefined; // set while inside a Fountain dialogue block
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i]!;
    if (!line) {
      speaker = undefined;
      continue;
    }
    if (speaker) {
      push(line, PARENTHETICAL.test(line) ? "parenthetical" : "dialogue", speaker);
      continue;
    }
    const next = raw[i + 1];
    const prevBlank = i === 0 || !raw[i - 1];
    if (prevBlank && next && isFountainCharacter(line)) {
      // The character line folds into the following lines' speakerHint (R2).
      speaker = speakerName(line);
      continue;
    }
    if (HEADING.test(line)) {
      push(line, "heading");
      continue;
    }
    if (PARENTHETICAL.test(line)) {
      push(line, "parenthetical");
      continue;
    }
    const named = NAME_COLON.exec(line);
    if (named && !TITLE_PAGE_KEYS.has(named[1]!.toLowerCase())) {
      push(line, "dialogue", named[1]);
      continue;
    }
    if (DASH.test(line) || (QUOTE_OPEN.test(line) && SPEECH_VERBS.test(line))) {
      push(line, "dialogue");
      continue;
    }
    push(line, "action");
  }
  return out;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
