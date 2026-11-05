"use client";

import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import type { PlayerRef } from "@remotion/player";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TimelineIssue } from "@storyflow/shared/timeline";
import { tmpId, useTimeline } from "@/hooks/useTimeline";
import { api, type Asset, type Clip, type Project, type Track } from "@/lib/api";
import { Asset3dPanel } from "./Asset3dPanel";
import { AssetLibrary } from "./AssetLibrary";
import { ClipInspector } from "./ClipInspector";
import { PlayerPanel } from "./PlayerPanel";
import { PromptPanel } from "./PromptPanel";
import { RenderPanel } from "./RenderPanel";
import { ScriptEditor } from "./ScriptEditor";
import { Timeline } from "./timeline/Timeline";

const TRACK_FOR_ASSET: Record<string, Track["kind"]> = { IMAGE: "VISUAL", VIDEO: "VISUAL", RENDER_3D: "OVERLAY_3D", AUDIO: "AUDIO" };
type Tab = "edit" | "script" | "3d" | "settings";

export function Editor({ initialProject }: { initialProject: Project }) {
  const [project, setProject] = useState(initialProject);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [tab, setTab] = useState<Tab>("edit");
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [pxPerFrame, setPxPerFrame] = useState(4);
  const [frame, setFrame] = useState(0);
  const [rejected, setRejected] = useState<TimelineIssue[]>([]);
  const [scriptRefresh, setScriptRefresh] = useState(0);
  const playerRef = useRef<PlayerRef>(null);

  const loadAssets = useCallback(async () => setAssets(await api<Asset[]>(`/projects/${project.id}/assets`)), [project.id]);
  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const tl = useTimeline(project.id, assets);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Fetch preview URLs for READY assets we don't have yet (e.g. new 3D renders).
  useEffect(() => {
    for (const a of assets) {
      if (a.status === "READY" && !tl.assetUrls[a.id] && a.kind !== "MODEL_3D") {
        void api<{ url: string }>(`/assets/${a.id}/url`).then(({ url }) => tl.addAssetUrl(a.id, url)).catch(() => undefined);
      }
    }
  }, [assets]);

  // Keep the timeline playhead in sync with the Player.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    player.addEventListener("frameupdate", onFrame);
    return () => player.removeEventListener("frameupdate", onFrame);
  }, [tl.tracks]);

  const reject = (issues: TimelineIssue[]) => {
    setRejected(issues);
    setTimeout(() => setRejected([]), 3000);
  };
  const edit = (fn: (prev: Track[]) => Track[]) => {
    const issues = tl.update(fn);
    if (issues.length) reject(issues);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const data = event.active.data.current as { type: string; clipId?: string; trackId?: string; assetId?: string; kind?: string };
    const over = event.over?.data.current as { trackId: string; kind: Track["kind"] } | undefined;
    if (data.type === "clip") {
      const delta = Math.round(event.delta.x / pxPerFrame);
      const target = over?.trackId ?? data.trackId!;
      edit((prev) => {
        const moving = prev.flatMap((t) => t.clips).find((c) => c.id === data.clipId);
        if (!moving) return prev;
        const moved: Clip = { ...moving, startFrame: Math.max(0, moving.startFrame + delta) };
        return prev.map((t) => {
          const clips = t.clips.filter((c) => c.id !== data.clipId);
          return t.id === target ? { ...t, clips: [...clips, moved] } : { ...t, clips };
        });
      });
    } else if (data.type === "asset" && over && event.over) {
      const asset = assets.find((a) => a.id === data.assetId);
      if (!asset) return;
      const left = (event.active.rect.current.translated?.left ?? event.over.rect.left) - event.over.rect.left;
      const duration = asset.durationMs ? Math.max(1, Math.round((asset.durationMs / 1000) * project.fps)) : project.fps * 3;
      edit((prev) =>
        prev.map((t) => {
          if (t.id !== over.trackId) return t;
          let start = Math.max(0, Math.round(left / pxPerFrame));
          const overlaps = t.clips.some((c) => start < c.startFrame + c.durationInFrames && c.startFrame < start + duration);
          if (overlaps) start = Math.max(0, ...t.clips.map((c) => c.startFrame + c.durationInFrames));
          return { ...t, clips: [...t.clips, { id: tmpId("clip"), assetId: asset.id, startFrame: start, durationInFrames: duration, trimStartFrame: 0, props: {} }] };
        }),
      );
    }
  };

  const addTrack = (kind: Track["kind"]) =>
    edit((prev) => [...prev, { id: tmpId("track"), kind, order: Math.max(-1, ...prev.map((t) => t.order)) + 1, muted: false, locked: false, clips: [] }]);

  const addTextClip = () =>
    edit((prev) => {
      let tracks = prev;
      let text = prev.find((t) => t.kind === "TEXT");
      if (!text) {
        text = { id: tmpId("track"), kind: "TEXT", order: Math.max(-1, ...prev.map((t) => t.order)) + 1, muted: false, locked: false, clips: [] };
        tracks = [...prev, text];
      }
      const start = Math.max(0, ...text.clips.map((c) => c.startFrame + c.durationInFrames));
      const clip: Clip = { id: tmpId("clip"), assetId: null, startFrame: start, durationInFrames: project.fps * 3, trimStartFrame: 0, props: { text: "New title" } };
      return tracks.map((t) => (t.id === text!.id ? { ...t, clips: [...t.clips, clip] } : t));
    });

  const selected = tl.tracks?.flatMap((t) => t.clips.map((c) => ({ clip: c, track: t }))).find((x) => x.clip.id === selectedClipId);

  const saveSettings = async (patch: Partial<Pick<Project, "title" | "fps" | "width" | "height">>) => {
    setProject(await api<Project>(`/projects/${project.id}`, { method: "PATCH", json: patch }));
  };

  if (!tl.tracks) return <p className="p-6 text-slate-400">Loading project…</p>;

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-3">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-xl font-bold">{project.title}</h1>
            <span className="text-xs text-slate-500">
              {project.width}×{project.height} · {project.fps} fps
            </span>
            <span className="flex-1" />
            <span className="text-xs text-slate-500">{tl.saving ? "Saving…" : "Saved"}</span>
          </div>
          {tl.conflict && (
            <div className="flex items-center gap-2 rounded border border-amber-500/60 bg-amber-500/10 p-2 text-sm">
              <span className="flex-1">Timeline changed elsewhere — reload to continue editing.</span>
              <button onClick={() => void tl.reload()} className="rounded bg-amber-500 px-3 py-1 font-semibold text-slate-950">
                Reload
              </button>
            </div>
          )}
          {[...tl.issues, ...rejected].length > 0 && (
            <ul className="rounded border border-red-500/50 bg-red-500/10 p-2 text-xs text-red-300">
              {[...tl.issues, ...rejected].map((i, k) => (
                <li key={k}>
                  {i.path.join(".")}: {i.message}
                </li>
              ))}
            </ul>
          )}
          <PlayerPanel ref={playerRef} project={project} tracks={tl.tracks} assets={assets} assetUrls={tl.assetUrls} />
          <div className="flex flex-wrap gap-2 text-xs">
            {(["VISUAL", "OVERLAY_3D", "TEXT", "AUDIO"] as const).map((k) => (
              <button key={k} onClick={() => addTrack(k)} className="rounded bg-slate-800 px-2 py-1 hover:bg-slate-700">
                + {k.replace("_", " ")} track
              </button>
            ))}
            <button onClick={addTextClip} className="rounded bg-emerald-800 px-2 py-1 hover:bg-emerald-700">
              + Text clip
            </button>
          </div>
          <Timeline
            tracks={tl.tracks}
            assets={assets}
            fps={project.fps}
            playheadFrame={frame}
            selectedClipId={selectedClipId}
            pxPerFrame={pxPerFrame}
            onZoom={setPxPerFrame}
            onSelectClip={setSelectedClipId}
            onSeek={(f) => {
              playerRef.current?.seekTo(f);
              setFrame(f);
            }}
            update={tl.update}
            onRejected={reject}
          />
          <RenderPanel projectId={project.id} />
        </div>

        <aside className="space-y-4">
          <nav className="flex gap-1 text-xs">
            {(["edit", "script", "3d", "settings"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`rounded px-3 py-1.5 ${tab === t ? "bg-slate-700" : "hover:bg-slate-800"}`}>
                {t === "3d" ? "3D" : t[0]!.toUpperCase() + t.slice(1)}
              </button>
            ))}
          </nav>
          {tab === "edit" && (
            <>
              {selected && (
                <div className="rounded-lg border border-slate-800 p-3">
                  <ClipInspector
                    clip={selected.clip}
                    track={selected.track}
                    onChange={(props) =>
                      edit((prev) => prev.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === selected.clip.id ? { ...c, props } : c)) })))
                    }
                    onDelete={() => {
                      edit((prev) => prev.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== selected.clip.id) })));
                      setSelectedClipId(null);
                    }}
                  />
                </div>
              )}
              <div className="rounded-lg border border-slate-800 p-3">
                <AssetLibrary projectId={project.id} assets={assets} assetUrls={tl.assetUrls} onChanged={() => void loadAssets()} onUrl={tl.addAssetUrl} />
              </div>
            </>
          )}
          {tab === "script" && (
            <div className="space-y-4 rounded-lg border border-slate-800 p-3">
              <PromptPanel
                projectId={project.id}
                initialPrompt={project.prompt ?? ""}
                onGenerated={() => {
                  setScriptRefresh((n) => n + 1);
                  void loadAssets();
                }}
              />
              <ScriptEditor
                projectId={project.id}
                refreshKey={scriptRefresh}
                timelineHasClips={tl.tracks.some((t) => t.clips.length > 0)}
                onApplied={async () => {
                  setProject(await api<Project>(`/projects/${project.id}`));
                  await loadAssets();
                  await tl.reload();
                }}
              />
            </div>
          )}
          {tab === "3d" && (
            <div className="rounded-lg border border-slate-800 p-3">
              <Asset3dPanel projectId={project.id} models={assets.filter((a) => a.kind === "MODEL_3D" && a.status === "READY")} onDone={() => void loadAssets()} />
              <p className="mt-2 text-[11px] text-slate-500">
                Finished renders appear in Assets; drag them onto an OVERLAY 3D track ({TRACK_FOR_ASSET.RENDER_3D}).
              </p>
            </div>
          )}
          {tab === "settings" && (
            <form
              className="space-y-2 rounded-lg border border-slate-800 p-3 text-xs"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void saveSettings({ title: String(f.get("title")), fps: Number(f.get("fps")), width: Number(f.get("width")), height: Number(f.get("height")) });
              }}
            >
              <label className="block">
                Title
                <input name="title" defaultValue={project.title} maxLength={120} className="mt-1 w-full rounded bg-slate-800 px-2 py-1" />
              </label>
              <div className="flex gap-2">
                <label className="flex-1">
                  Width
                  <input name="width" type="number" step={2} min={16} max={7680} defaultValue={project.width} className="mt-1 w-full rounded bg-slate-800 px-2 py-1" />
                </label>
                <label className="flex-1">
                  Height
                  <input name="height" type="number" step={2} min={16} max={7680} defaultValue={project.height} className="mt-1 w-full rounded bg-slate-800 px-2 py-1" />
                </label>
                <label>
                  FPS
                  <select name="fps" defaultValue={project.fps} className="mt-1 rounded bg-slate-800 px-2 py-1">
                    {[24, 25, 30, 60].map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </label>
              </div>
              <button className="rounded bg-sky-500 px-3 py-1.5 font-semibold text-slate-950">Save settings</button>
            </form>
          )}
        </aside>
      </div>
    </DndContext>
  );
}
