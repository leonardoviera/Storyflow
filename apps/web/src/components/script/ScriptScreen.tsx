"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useScript } from "@/hooks/useScript";
import { ApiError, startBreakdown } from "@/lib/api";
import { ScriptInput } from "./ScriptInput";
import { SettingsBar } from "./SettingsBar";
import { UploadReview } from "./UploadReview";

type Mode = "write" | "idea";

/** The first screen of a new project (FR-001): the script, its settings, then the breakdown. */
export function ScriptScreen({ projectId, title }: { projectId: string; title: string }) {
  const router = useRouter();
  const { script, state, error, changedElsewhere, dismissChanged, update, flush } = useScript(projectId);
  const [mode, setMode] = useState<Mode>("write");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  if (!script) return <p className="p-6 text-slate-400">Loading script…</p>;

  const start = async () => {
    setStarting(true);
    setStartError(null);
    try {
      await flush();
      await startBreakdown(projectId);
      router.push(`/projects/${projectId}/breakdown`);
    } catch (err) {
      setStartError(err instanceof ApiError ? err.message : String(err));
      setStarting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{title}</h1>
        <Link href={`/projects/${projectId}/breakdown`} className="text-sm text-sky-400 hover:underline">
          Open breakdown →
        </Link>
      </div>
      {changedElsewhere && (
        <p className="rounded border border-amber-700 bg-amber-950/50 px-3 py-2 text-sm text-amber-200">
          The script was changed elsewhere; the latest version was loaded.{" "}
          <button type="button" onClick={dismissChanged} className="underline">
            OK
          </button>
        </p>
      )}
      <SettingsBar settings={script} onChange={update} />
      <div className="flex gap-2 border-b border-slate-800 text-sm">
        {(
          [
            ["write", "Paste or upload"],
            ["idea", "Generate from an idea"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`-mb-px border-b-2 px-3 py-2 ${mode === value ? "border-sky-400 text-sky-300" : "border-transparent text-slate-400"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "write" ? (
        <>
          <UploadReview
            projectId={projectId}
            onAccept={(r) => update({ text: r.text, origin: "UPLOAD", sourceAssetId: r.sourceAssetId })}
          />
          <ScriptInput text={script.text} onChange={(text) => update({ text })} saveState={state} saveError={error} />
        </>
      ) : (
        <p className="rounded border border-slate-800 p-6 text-sm text-slate-400">Generating a script from an idea is coming soon.</p>
      )}
      <div className="flex items-center justify-end gap-3">
        {startError && <p className="text-sm text-red-400">{startError}</p>}
        <button
          type="button"
          disabled={starting || !script.text.trim()}
          onClick={() => void start()}
          className="rounded bg-sky-500 px-5 py-2 font-semibold text-slate-950 disabled:opacity-50"
        >
          {starting ? "Starting…" : "Start breakdown"}
        </button>
      </div>
    </div>
  );
}
