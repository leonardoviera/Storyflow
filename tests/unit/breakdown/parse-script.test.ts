import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { countWords, estimateTokens, parseScript } from "../../../packages/shared/src/breakdown";

const fixture = (name: string) => readFileSync(new URL(`../../fixtures/scripts/${name}`, import.meta.url), "utf8");

describe("parseScript", () => {
  it("normalizes CRLF, drops blank lines and numbers lines L1…Ln", () => {
    const lines = parseScript("Primeira linha\r\n\r\n   \r\nSegunda linha\r\n");
    expect(lines.map((l) => [l.id, l.text])).toEqual([
      ["L1", "Primeira linha"],
      ["L2", "Segunda linha"],
    ]);
  });

  it.each([
    ["INT. PADARIA - DIA"],
    ["EXT. RUA - NOITE"],
    ["INT./EXT. CARRO - DIA"],
    ["I/E CARRO - DIA"],
    ["INT PADARIA - DIA"],
    ["CENA 3"],
    ["# O Pão das Cinco"],
  ])("detects heading %s", (text) => {
    expect(parseScript(text)[0]!.hint).toBe("heading");
  });

  it("detects NAME: text dialogue in caps or title case, with accents", () => {
    const lines = parseScript("SEU ANTÔNIO: Bom dia.\nDra. Lima: Pode entrar.\nDona Célia: Um de cada.");
    expect(lines.map((l) => [l.hint, l.speakerHint])).toEqual([
      ["dialogue", "SEU ANTÔNIO"],
      ["dialogue", "Dra. Lima"],
      ["dialogue", "Dona Célia"],
    ]);
  });

  it("does not take a sentence with a colon for dialogue", () => {
    expect(parseScript("Lucas escreve na última página: cinquenta.")[0]!.hint).toBe("action");
  });

  it("folds a Fountain character line into the following lines", () => {
    const lines = parseScript("Priya stares.\n\nPRIYA (CONT'D)\n(flat)\nWe ran it eleven times.\n\nMarcus stops.");
    expect(lines.map((l) => [l.text, l.hint, l.speakerHint])).toEqual([
      ["Priya stares.", "action", undefined],
      ["(flat)", "parenthetical", "PRIYA"],
      ["We ran it eleven times.", "dialogue", "PRIYA"],
      ["Marcus stops.", "action", undefined],
    ]);
  });

  it("detects dash dialogue without a speaker hint", () => {
    const lines = parseScript("— Mãe, posso ajudar?\n- Pode.");
    expect(lines.map((l) => [l.hint, l.speakerHint])).toEqual([
      ["dialogue", undefined],
      ["dialogue", undefined],
    ]);
  });

  it("detects a quoted line with a speech verb", () => {
    expect(parseScript("“Chegamos”, disse o capitão.")[0]!.hint).toBe("dialogue");
    expect(parseScript("“Farol” era o nome do barco.")[0]!.hint).toBe("action");
  });

  it("detects parentheticals", () => {
    expect(parseScript("(sorrindo)")[0]!.hint).toBe("parenthetical");
  });

  it("skips Fountain title page keys", () => {
    expect(parseScript("Title: Demo Day")[0]!.hint).toBe("action");
  });

  it("padaria.md: screenplay with headings and NAME: dialogue", () => {
    const lines = parseScript(fixture("padaria.md"));
    expect(lines.filter((l) => l.hint === "heading").length).toBeGreaterThanOrEqual(7);
    const speakers = new Set(lines.map((l) => l.speakerHint).filter(Boolean));
    expect(speakers).toEqual(new Set(["LUCAS", "SEU ANTÔNIO", "DONA CÉLIA"]));
  });

  it("farol.txt: prose only, no dialogue", () => {
    const lines = parseScript(fixture("farol.txt"));
    expect(lines.every((l) => l.hint === "action")).toBe(true);
  });

  it("startup.md: Fountain character lines become speaker hints", () => {
    const lines = parseScript(fixture("startup.md"));
    expect(new Set(lines.map((l) => l.speakerHint).filter(Boolean))).toEqual(new Set(["PRIYA", "MARCUS", "DANA"]));
    expect(lines.some((l) => l.text === "PRIYA")).toBe(false);
  });

  it("familia.md: dash dialogue", () => {
    const lines = parseScript(fixture("familia.md"));
    expect(lines.filter((l) => l.hint === "dialogue").length).toBeGreaterThan(20);
    expect(lines.every((l) => l.speakerHint === undefined)).toBe(true);
  });

  it("serie-ep.md: titled speakers", () => {
    const lines = parseScript(fixture("serie-ep.md"));
    expect(new Set(lines.map((l) => l.speakerHint).filter(Boolean))).toEqual(
      new Set(["TIAGO", "ANA", "SEU WALDEMAR", "DR. RAUL"]),
    );
  });

  it("keeps every line's text verbatim", () => {
    const text = fixture("padaria.md");
    const lines = parseScript(text);
    const original = text.split("\n").map((l) => l.trim()).filter(Boolean);
    expect(lines.map((l) => l.text)).toEqual(original);
  });
});

describe("estimateTokens / countWords", () => {
  it("estimates chars / 3.5 rounded up", () => {
    expect(estimateTokens("1234567")).toBe(2);
    expect(estimateTokens("12345678")).toBe(3);
  });
  it("counts whitespace-separated words", () => {
    expect(countWords("  um  dois\ttrês\n")).toBe(3);
    expect(countWords("")).toBe(0);
  });
});
