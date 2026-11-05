import { getPrisma, type Prisma } from "@storyflow/db";
import { writeEpisodeResult } from "@storyflow/db/breakdowns";
import { fail, isCancelled, JobCancelled, markRunning, reportProgress, succeed } from "@storyflow/db/jobs";
import type { WorkContext } from "@storyflow/db/queue";
import {
  BibleAsset,
  BreakdownDocument,
  ScriptSettings,
  SourceLine,
  type Episode,
} from "@storyflow/shared/breakdown";
import { BreakdownCancelled, BreakdownStepError, isLlmUnavailable, runAnalyze, runEpisode } from "@storyflow/shared/llm";
import type { QueuePayload } from "@storyflow/shared/queue";
import { z } from "zod";
import { errorMessage, log } from "../lib/runtime";

// breakdown.run (contracts/queue-jobs-delta.md): analyze pass (mode full), then one episode pass
// per episode. The worker is the only writer of the document while the job runs (R7). Episode
// failures do not stop the run; the breakdown ends READY, PARTIAL, FAILED or CANCELLED.

type StepStatus = "pending" | "running" | "done" | "failed";
type JobStep = { key: string; status: StepStatus; error: string | null };

/** Analysis results the episode passes need again on a retry; kept with the settings snapshot. */
const Analysis = z.object({ speakerMap: z.record(z.string(), z.string()), maxSensibleEpisodes: z.number() });
const StoredSettings = ScriptSettings.extend({ analysis: Analysis.optional() });

export const AI_UNAVAILABLE = "AI server unavailable";


export async function handleBreakdownRun(payload: QueuePayload<"breakdown.run">, _ctx: WorkContext) {
  const prisma = getPrisma();
  const { jobId, breakdownId, mode } = payload;
  const steps: JobStep[] = [];
  const shouldStop = () => isCancelled(jobId);
  let analyzing = false;
  let analysisDone = mode !== "full";

  const saveSteps = () =>
    prisma.job.updateMany({ where: { id: jobId, status: "RUNNING" }, data: { output: { steps } as Prisma.InputJsonValue } });
  const setStep = async (key: string, status: StepStatus, error: string | null = null) => {
    const step = steps.find((s) => s.key === key);
    if (step) Object.assign(step, { status, error });
    else steps.push({ key, status, error });
    await saveSteps();
  };

  try {
    await markRunning(jobId);
    const breakdown = await prisma.breakdown.findUniqueOrThrow({ where: { id: breakdownId } });
    const script = await prisma.projectScript.findUnique({ where: { projectId: breakdown.projectId } });
    const sourceLines = z.array(SourceLine).parse(breakdown.sourceLines);
    const settings = StoredSettings.parse(breakdown.settings);
    await prisma.breakdown.update({ where: { id: breakdownId }, data: { status: "RUNNING", jobId } });

    let doc: BreakdownDocument;
    let analysis = settings.analysis;
    if (mode === "full") {
      if (await isCancelled(jobId)) throw new JobCancelled(jobId);
      analyzing = true;
      await setStep("analyze", "running");
      const fixedAssets = z.array(BibleAsset).parse(script?.libraryImports ?? []);
      const result = await runAnalyze({
        sourceLines,
        settings,
        fixedAssets,
        onStep: (message) => log("breakdown analyze", { jobId, message }),
        shouldStop,
      });
      analyzing = false;
      analysisDone = true;
      doc = result.doc;
      analysis = { speakerMap: result.speakerMap, maxSensibleEpisodes: result.maxSensibleEpisodes };
      await prisma.breakdown.update({
        where: { id: breakdownId },
        data: {
          document: doc as Prisma.InputJsonValue,
          settings: { ...settings, analysis } as Prisma.InputJsonValue,
          revision: { increment: 1 },
        },
      });
      await setStep("analyze", "done");
      await reportProgress(jobId, 0.1);
    } else {
      doc = BreakdownDocument.parse(breakdown.document);
    }
    if (!analysis) throw new BreakdownStepError("This breakdown has no analysis to retry from; start a new breakdown");

    const wanted = new Set(payload.episodeIds ?? []);
    const toRun = doc.episodes.filter((e) =>
      mode === "full" ? true : wanted.has(e.id) && (e.status === "failed" || e.status === "pending"),
    );
    for (const e of doc.episodes) {
      await setStep(e.id, e.status === "running" ? "pending" : e.status, e.error ?? null);
    }

    let cancelled = false;
    const write = (episode: Episode) => writeEpisodeResult(breakdownId, episode.id, episode);
    for (const [i, episode] of toRun.entries()) {
      if (await isCancelled(jobId)) {
        cancelled = true;
        break;
      }
      await write({ ...episode, status: "running", error: undefined });
      await setStep(episode.id, "running");
      try {
        const done = await runEpisode({ doc, episode, sourceLines, speakerMap: analysis.speakerMap, shouldStop });
        await write(done);
        await setStep(episode.id, "done");
      } catch (err) {
        if (err instanceof BreakdownCancelled) {
          // The episode in progress goes back to pending so it can be retried (FR-011).
          await write({ ...episode, status: "pending", error: undefined });
          await setStep(episode.id, "pending");
          cancelled = true;
          break;
        }
        const reason = isLlmUnavailable(err) ? AI_UNAVAILABLE : errorMessage(err);
        log("breakdown episode failed", { jobId, episodeId: episode.id, error: reason });
        await write({ ...episode, status: "failed", error: reason, segments: [] });
        await setStep(episode.id, "failed", reason);
        if (isLlmUnavailable(err)) throw err;
      }
      await reportProgress(jobId, (mode === "full" ? 0.1 : 0) + ((mode === "full" ? 0.9 : 1) * (i + 1)) / toRun.length);
    }

    const final = BreakdownDocument.parse((await prisma.breakdown.findUniqueOrThrow({ where: { id: breakdownId } })).document);
    if (cancelled) {
      await prisma.breakdown.update({ where: { id: breakdownId }, data: { status: "CANCELLED" } });
      log("breakdown cancelled", { jobId, breakdownId });
      return;
    }
    const status = final.episodes.every((e) => e.status === "done") ? "READY" : "PARTIAL";
    await prisma.breakdown.update({ where: { id: breakdownId }, data: { status } });
    await succeed(jobId, { steps } as Prisma.InputJsonValue);
    log("breakdown finished", { jobId, breakdownId, status });
  } catch (err) {
    if (err instanceof JobCancelled || err instanceof BreakdownCancelled) {
      await prisma.breakdown.update({ where: { id: breakdownId }, data: { status: "CANCELLED" } }).catch(() => undefined);
      log("breakdown cancelled", { jobId, breakdownId });
      return;
    }
    const reason = isLlmUnavailable(err) ? AI_UNAVAILABLE : errorMessage(err);
    log("breakdown failed", { jobId, breakdownId, error: reason });
    if (analyzing) await setStep("analyze", "failed", reason).catch(() => undefined);
    // No analysis means nothing to keep (FAILED); otherwise finished episodes stay (PARTIAL).
    await prisma.breakdown
      .update({ where: { id: breakdownId }, data: { status: analysisDone ? "PARTIAL" : "FAILED" } })
      .catch(() => undefined);
    await fail(jobId, reason).catch(() => undefined);
  }
}
