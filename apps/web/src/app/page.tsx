"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { archiveProject, listProjects, type ProjectListItem } from "@/lib/api";

const BADGE_STYLES = {
  EMPTY: "bg-slate-800 text-slate-400",
  SCRIPT: "bg-slate-800 text-slate-200",
  BREAKDOWN: "bg-violet-950 text-violet-300",
  TIMELINE: "bg-sky-950 text-sky-300",
};

function StatusBadge({ status }: { status: ProjectListItem["status"] }) {
  const label =
    status.stage === "BREAKDOWN"
      ? `Breakdown · ${status.breakdownStatus.toLowerCase()}`
      : { EMPTY: "Empty", SCRIPT: "Script", TIMELINE: "Timeline" }[status.stage];
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${BADGE_STYLES[status.stage]}`}>{label}</span>;
}

export default function HomePage() {
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  useEffect(() => {
    listProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  async function archive(id: string) {
    setArchiveError(null);
    try {
      await archiveProject(id);
      setProjects((ps) => ps?.filter((p) => p.id !== id) ?? null);
    } catch (e) {
      setArchiveError(e instanceof Error ? e.message : "Could not archive the project");
    } finally {
      setConfirmingId(null);
    }
  }

  const q = query.trim().toLowerCase();
  const visible = projects?.filter((p) => p.title.toLowerCase().includes(q)) ?? [];

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <button onClick={() => setOpen(true)} className="rounded bg-sky-500 px-4 py-2 font-semibold text-slate-950 hover:bg-sky-400">
          New project
        </button>
      </div>
      {projects !== null && projects.length > 0 && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects"
          aria-label="Search projects"
          className="mb-4 w-full rounded border border-slate-800 bg-slate-900 px-3 py-2 text-sm placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
        />
      )}
      {archiveError && <p className="mb-4 text-sm text-red-400">{archiveError}</p>}
      {projects === null ? (
        <p className="text-slate-400">Loading…</p>
      ) : projects.length === 0 ? (
        <p className="text-slate-400">No projects yet. Create one to start.</p>
      ) : visible.length === 0 ? (
        <p className="text-slate-400">No projects match “{query.trim()}”.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {visible.map((p) => (
            <li key={p.id} className="relative rounded-lg border border-slate-800 hover:border-sky-500">
              <Link href={`/projects/${p.id}`} className="block p-4 pr-24">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 truncate font-semibold">{p.title}</span>
                  <StatusBadge status={p.status} />
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {p.width}×{p.height} · {p.fps} fps · {(p.durationInFrames / p.fps).toFixed(1)} s · updated{" "}
                  {new Date(p.updatedAt).toLocaleString()}
                </div>
              </Link>
              <div className="absolute right-3 top-3 flex gap-1 text-xs">
                {confirmingId === p.id ? (
                  <>
                    <button onClick={() => void archive(p.id)} className="rounded bg-red-500 px-2 py-1 font-semibold text-slate-950 hover:bg-red-400">
                      Archive
                    </button>
                    <button onClick={() => setConfirmingId(null)} className="rounded px-2 py-1 text-slate-300 hover:bg-slate-800">
                      Cancel
                    </button>
                  </>
                ) : (
                  <button onClick={() => setConfirmingId(p.id)} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
                    Archive
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {open && <NewProjectDialog onClose={() => setOpen(false)} />}
    </div>
  );
}
