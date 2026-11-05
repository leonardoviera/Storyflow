"use client";

import { useRef, useState } from "react";
import { ApiError, uploadScript, type ScriptUploadResult } from "@/lib/api";

// Upload error codes from POST /script/upload (R8), shown in pt-BR.
const UPLOAD_ERRORS: Record<string, string> = {
  TOO_LARGE: "O arquivo tem mais de 10 MB.",
  UNSUPPORTED_TYPE: "Formato não suportado. Envie um arquivo .txt, .md ou .docx.",
  NOT_UTF8: "O arquivo não está em UTF-8. Salve-o como UTF-8 e tente de novo.",
  DOCX_UNREADABLE: "Não foi possível ler o .docx (arquivo corrompido ou protegido por senha).",
  TOO_MANY_WORDS: "O roteiro passa do limite de 50.000 palavras.",
};

/** Pick a .txt/.md/.docx file, show the extracted text, and only replace the script on accept. */
export function UploadReview({
  projectId,
  onAccept,
}: {
  projectId: string;
  onAccept: (result: ScriptUploadResult) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ScriptUploadResult | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setPreview(await uploadScript(projectId, file));
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setError((code && UPLOAD_ERRORS[code]) ?? (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="text-sm">
      <input ref={input} type="file" accept=".txt,.md,.docx" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="rounded bg-slate-800 px-3 py-2 text-slate-200 hover:bg-slate-700 disabled:opacity-50"
      >
        {busy ? "Reading file…" : "Upload .txt, .md or .docx"}
      </button>
      {error && <p className="mt-2 text-red-400">{error}</p>}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setPreview(null)}>
          <div onClick={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-lg font-bold">Review the extracted text</h2>
            <p className="text-xs text-slate-400">
              {preview.wordCount.toLocaleString()} words. Using it replaces the current script.
            </p>
            <pre className="flex-1 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 font-mono text-xs">{preview.text}</pre>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPreview(null)} className="rounded px-4 py-2 text-slate-300 hover:bg-slate-800">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onAccept(preview);
                  setPreview(null);
                }}
                className="rounded bg-sky-500 px-4 py-2 font-semibold text-slate-950"
              >
                Use this text
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
