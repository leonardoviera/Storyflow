import type { BreakdownDocument } from "@storyflow/shared/breakdown";

export function SynopsisPanel({ doc }: { doc: BreakdownDocument }) {
  const { synopsis } = doc;
  const nameOf = (id: string) => doc.assets.find((a) => a.id === id)?.name ?? "Unknown";
  return (
    <section className="space-y-3 rounded border border-slate-800 p-4 text-sm">
      <h2 className="text-base font-semibold">Synopsis</h2>
      <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1">
        <dt className="text-slate-400">Story type</dt>
        <dd>{synopsis.storyType || "—"}</dd>
        <dt className="text-slate-400">Audience</dt>
        <dd>{synopsis.audience || "—"}</dd>
        <dt className="text-slate-400">Setting</dt>
        <dd>{synopsis.setting || "—"}</dd>
      </dl>
      <p className="whitespace-pre-wrap leading-relaxed">{synopsis.summary}</p>
      {synopsis.characterProfiles.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-xs uppercase tracking-wide text-slate-400">Characters</h3>
          {synopsis.characterProfiles.map((p) => (
            <p key={p.assetId}>
              <span className="font-semibold">{nameOf(p.assetId)}:</span> {p.profile}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
