"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { validateTimeline, type TimelineIssue } from "@storyflow/shared/timeline";
import { api, ApiError, type Asset, type Timeline, type Track } from "@/lib/api";

const AUTOSAVE_MS = 750;

let tmp = 0;
export const tmpId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(tmp++).toString(36)}`;

/**
 * Local editor state seeded from GET /timeline, optimistic edits, debounced PUT with baseRevision.
 * 409 → stop autosaving and ask for a reload; 422 → surface issues inline.
 */
export function useTimeline(projectId: string, assets: Asset[]) {
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [issues, setIssues] = useState<TimelineIssue[]>([]);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const revision = useRef(0);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    const t = await api<Timeline>(`/projects/${projectId}/timeline`);
    revision.current = t.revision;
    dirty.current = false;
    setConflict(false);
    setIssues([]);
    setTracks(t.tracks);
    setAssetUrls((prev) => ({ ...prev, ...(t.previewProps.assetUrls ?? {}) }));
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (next: Track[]) => {
      setSaving(true);
      try {
        const t = await api<Timeline>(`/projects/${projectId}/timeline`, {
          method: "PUT",
          json: {
            baseRevision: revision.current,
            tracks: next.map(({ kind, order, muted, locked, clips }) => ({
              kind,
              order,
              muted,
              locked,
              clips: clips.map(({ sceneId, assetId, startFrame, durationInFrames, trimStartFrame, props }) => ({
                sceneId: sceneId ?? null,
                assetId,
                startFrame,
                durationInFrames,
                trimStartFrame,
                props,
              })),
            })),
          },
        });
        revision.current = t.revision;
        dirty.current = false;
        setIssues([]);
        setAssetUrls((prev) => ({ ...prev, ...(t.previewProps.assetUrls ?? {}) }));
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) setConflict(true);
        else if (err instanceof ApiError && err.status === 422) setIssues(err.issues);
        else throw err;
      } finally {
        setSaving(false);
      }
    },
    [projectId],
  );

  const kinds = Object.fromEntries(assets.map((a) => [a.id, a.kind]));

  /** Applies an edit if the result is valid; returns the issues otherwise (edit rejected). */
  const update = useCallback(
    (fn: (prev: Track[]) => Track[]): TimelineIssue[] => {
      if (!tracks || conflict) return [];
      const next = fn(tracks);
      const problems = validateTimeline(next, kinds);
      if (problems.length) return problems;
      setTracks(next);
      dirty.current = true;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(next), AUTOSAVE_MS);
      return [];
    },
    [tracks, conflict, save, JSON.stringify(kinds)],
  );

  return {
    tracks,
    update,
    reload: load,
    issues,
    conflict,
    saving,
    assetUrls,
    addAssetUrl: (id: string, url: string) => setAssetUrls((p) => ({ ...p, [id]: url })),
  };
}
