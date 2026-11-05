"use client";

import { useEffect, useState } from "react";
import { api, isTerminal, type Job } from "@/lib/api";

/** Polls GET /api/jobs/{id} every second while the job is QUEUED or RUNNING. */
export function useJob(jobId: string | null, onDone?: (job: Job) => void) {
  const [job, setJob] = useState<Job | null>(null);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const next = await api<Job>(`/jobs/${jobId}`);
        if (stopped) return;
        setJob(next);
        if (isTerminal(next.status)) {
          onDone?.(next);
          return;
        }
      } catch {
        /* transient — retry */
      }
      timer = setTimeout(tick, 1000);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [jobId]);

  return job;
}
