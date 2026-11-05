"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, getBreakdown, listBreakdowns, retryBreakdownEpisode, type Breakdown } from "@/lib/api";
import { AssetBible } from "./AssetBible";
import { BreakdownProgress } from "./BreakdownProgress";
import { EpisodeTree } from "./EpisodeTree";
import { FlagsPanel } from "./FlagsPanel";
import { SynopsisPanel } from "./SynopsisPanel";

const POLL_MS = 3000;

/** Review screen, read-only in US1: progress while the job runs, then the result. */
export function BreakdownScreen({ projectId, title }: { projectId: string; title: string }) {
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [empty, setEmpty] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const versions = await listBreakdowns(projectId);
    const current = versions.find((v) => v.isCurrent) ?? versions[0];
    if (!current) {
      setEmpty(true);
      return;
    }
    const b = await getBreakdown(projectId, current.version);
    setBreakdown(b);
    setJobId((prev) => prev ?? (b.status === "RUNNING" ? b.jobId : null));
  }, [projectId]);

  useEffect(() => {
    load().catch((err) => setError(String(err)));
  }, [load]);

  // While the job runs, refresh the document so finished episodes appear one by one.
  const running = breakdown?.status === "RUNNING";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void load().catch(() => undefined), POLL_MS);
    return () => clearInterval(timer);
  }, [running, load]);

  const retry = async (episodeId: string) => {
    if (!breakdown) return;
    try {
      const { jobId: next } = await retryBreakdownEpisode(projectId, breakdown.version, episodeId);
      setJobId(next);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  if (error) return <p className="p-6 text-red-400">{error}</p>;
  if (empty) {
    return (
      <div className="p-6 text-sm">
        No breakdown yet.{" "}
        <Link href={`/projects/${projectId}/script`} className="text-sky-400 hover:underline">
          Go to the script
        </Link>
      </div>
    );
  }
  if (!breakdown) return <p className="p-6 text-slate-400">Loading breakdown…</p>;

  const { document: doc, settings, flags } = breakdown;
  const fewer =
    settings.analysis && settings.analysis.maxSensibleEpisodes < settings.episodeCount
      ? settings.analysis.maxSensibleEpisodes
      : null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">
          {title} <span className="text-sm font-normal text-slate-400">· breakdown v{breakdown.version} · {breakdown.status.toLowerCase()}</span>
        </h1>
        <Link href={`/projects/${projectId}/script`} className="text-sm text-sky-400 hover:underline">
          ← Script
        </Link>
      </div>
      {jobId && (
        <BreakdownProgress
          key={jobId}
          jobId={jobId}
          episodes={doc.episodes}
          onDone={() => void load()}
          onRetry={(id) => void retry(id)}
        />
      )}
      {fewer !== null && (
        <p className="rounded border border-amber-700 bg-amber-950/50 px-3 py-2 text-sm text-amber-200">
          You asked for {settings.episodeCount} episodes, but the script only has material for {fewer}. The breakdown
          uses {fewer}; change the episode count on the script screen and run it again to try another split.
        </p>
      )}
      {doc.assets.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
          <div className="space-y-4">
            <SynopsisPanel doc={doc} />
            <FlagsPanel flags={flags} />
          </div>
          <AssetBible doc={doc} />
        </div>
      )}
      <EpisodeTree doc={doc} flags={flags} />
    </div>
  );
}
