import { labelFor, type BreakdownDocument, type Flag } from "@storyflow/shared/breakdown";
import { anchorFor } from "./anchors";
import { MentionText } from "./MentionText";

const seconds = (frames: number, fps: number) => `${(frames / fps).toFixed(1)} s`;
const SIZE_LABEL: Record<string, string> = {
  extreme_wide: "Extreme wide",
  wide: "Wide",
  medium: "Medium",
  medium_close: "Medium close",
  close_up: "Close-up",
  extreme_close_up: "Extreme close-up",
  insert: "Insert",
};

/** Episodes → segments → shots, read-only (US1). Flagged items get an amber border. */
export function EpisodeTree({ doc, flags }: { doc: BreakdownDocument; flags: Flag[] }) {
  const flagged = new Set(flags.map((f) => f.path.split(".lines")[0]));
  const nameOf = (assetId: string | null) =>
    assetId ? (doc.assets.find((a) => a.id === assetId)?.name ?? "Unknown") : "Narrator";

  return (
    <section className="space-y-4">
      {doc.episodes.map((ep, ei) => {
        const total = ep.segments.reduce((n, s) => n + s.durationInFrames, 0);
        return (
          <article key={ep.id} id={anchorFor(`episodes[${ei}]`)} className="rounded border border-slate-800 p-4">
            <header className="mb-3 flex items-baseline justify-between">
              <h2 className="text-base font-semibold">
                Episode {ep.order}
                {ep.title && `: ${ep.title}`}
              </h2>
              <span className={`text-xs ${ep.lengthWarning ? "text-amber-300" : "text-slate-400"}`}>
                {ep.status === "done" ? `${seconds(total, doc.fps)} of ${seconds(ep.targetFrames, doc.fps)}` : ep.status}
              </span>
            </header>
            {ep.status === "failed" && <p className="text-sm text-red-300">{ep.error ?? "This episode failed."}</p>}
            <ol className="space-y-3">
              {ep.segments.map((seg, si) => {
                const segPath = `episodes[${ei}].segments[${si}]`;
                return (
                  <li
                    key={seg.id}
                    id={anchorFor(segPath)}
                    className={`rounded bg-slate-900/60 p-3 ${flagged.has(segPath) ? "border border-amber-700" : ""}`}
                  >
                    <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
                      <span className="font-semibold text-slate-300">Segment {seg.order}</span>
                      <span className="rounded bg-emerald-900 px-1.5 text-emerald-200">
                        {labelFor(doc, seg.settingVariantId) ?? "@missing setting"}
                      </span>
                      <span>{seconds(seg.durationInFrames, doc.fps)}</span>
                    </div>
                    <ol className="space-y-2">
                      {seg.shots.map((shot, hi) => {
                        const path = `${segPath}.shots[${hi}]`;
                        return (
                          <li
                            key={shot.id}
                            id={anchorFor(path)}
                            className={`rounded border p-2 text-sm ${flagged.has(path) ? "border-amber-700" : "border-slate-800"}`}
                          >
                            <div className="mb-1 flex flex-wrap gap-x-3 text-xs text-slate-400">
                              <span className="font-semibold text-slate-300">
                                Shot {shot.order}
                                {shot.continued && " (cont.)"}
                              </span>
                              <span>{seconds(shot.durationInFrames, doc.fps)}</span>
                              <span>{SIZE_LABEL[shot.shotSize]}</span>
                              <span>{shot.camera}</span>
                              <span>
                                {shot.visual.kind === "none" && "Text only"}
                                {shot.visual.kind === "image" &&
                                  `Image${shot.visual.fallbackReason ? ` (${shot.visual.fallbackReason})` : ""}`}
                                {shot.visual.kind === "3d" && `3D: ${shot.visual.tool}`}
                              </span>
                            </div>
                            {shot.action && (
                              <p className="text-slate-200">
                                <MentionText text={shot.action} doc={doc} />
                              </p>
                            )}
                            {shot.lines.map((line) => (
                              <p key={line.id} className="mt-1 border-l-2 border-slate-700 pl-2">
                                <span className="text-xs uppercase text-slate-400">{nameOf(line.speakerAssetId)}: </span>
                                {line.text}
                              </p>
                            ))}
                            {shot.sound && <p className="mt-1 text-xs text-slate-500">Sound: {shot.sound}</p>}
                          </li>
                        );
                      })}
                    </ol>
                  </li>
                );
              })}
            </ol>
          </article>
        );
      })}
    </section>
  );
}
