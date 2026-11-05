"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { api, type Project } from "@/lib/api";

export default function HomePage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api<Project[]>("/projects").then(setProjects).catch(() => setProjects([]));
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <button onClick={() => setOpen(true)} className="rounded bg-sky-500 px-4 py-2 font-semibold text-slate-950 hover:bg-sky-400">
          New project
        </button>
      </div>
      {projects === null ? (
        <p className="text-slate-400">Loading…</p>
      ) : projects.length === 0 ? (
        <p className="text-slate-400">No projects yet. Create one to start.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className="block rounded-lg border border-slate-800 p-4 hover:border-sky-500">
                <div className="font-semibold">{p.title}</div>
                <div className="mt-1 text-xs text-slate-400">
                  {p.width}×{p.height} · {p.fps} fps · {(p.durationInFrames / p.fps).toFixed(1)} s · updated{" "}
                  {new Date(p.updatedAt).toLocaleString()}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {open && <NewProjectDialog onClose={() => setOpen(false)} />}
    </div>
  );
}
