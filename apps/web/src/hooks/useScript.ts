"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ScriptSettings } from "@storyflow/shared/breakdown";
import { ApiError, getScript, putScript, type ProjectScript } from "@/lib/api";

const AUTOSAVE_MS = 800;

export type SaveState = "saved" | "saving" | "error";

type Draft = ScriptSettings & { text: string; origin?: ProjectScript["origin"]; sourceAssetId?: string | null };

/**
 * Script screen state: GET once, local edits, debounced PUT with baseRevision (FR-005).
 * 409 → refetch and tell the creator the script changed elsewhere.
 */
export function useScript(projectId: string) {
  const [script, setScript] = useState<ProjectScript | null>(null);
  const [state, setState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const [changedElsewhere, setChangedElsewhere] = useState(false);
  const revision = useRef(0);
  const pending = useRef<Draft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    const s = await getScript(projectId);
    revision.current = s.revision;
    pending.current = null;
    setScript(s);
    setState("saved");
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const draft = pending.current;
    if (!draft) return;
    pending.current = null;
    setState("saving");
    try {
      const saved = await putScript(projectId, { ...draft, baseRevision: revision.current });
      revision.current = saved.revision;
      setError(null);
      // Keep local text if the creator typed more while this save was in flight.
      setScript((cur) => (pending.current && cur ? { ...saved, ...pending.current } : saved));
      setState(pending.current ? "saving" : "saved");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setChangedElsewhere(true);
        await load();
        return;
      }
      setError(err instanceof ApiError ? err.message : String(err));
      setState("error");
    }
  }, [projectId, load]);

  const update = useCallback(
    (patch: Partial<Draft>) => {
      setScript((cur) => {
        if (!cur) return cur;
        const next = { ...cur, ...patch };
        pending.current = {
          ...pending.current, // keep an origin/sourceAssetId set earlier in this debounce window
          text: next.text,
          aspectRatio: next.aspectRatio,
          episodeSeconds: next.episodeSeconds,
          episodeCount: next.episodeCount,
          ...(patch.origin ? { origin: patch.origin } : {}),
          ...(patch.sourceAssetId !== undefined ? { sourceAssetId: patch.sourceAssetId } : {}),
        };
        return next;
      });
      setState("saving");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
    },
    [flush],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return { script, state, error, changedElsewhere, dismissChanged: () => setChangedElsewhere(false), update, flush, reload: load };
}
