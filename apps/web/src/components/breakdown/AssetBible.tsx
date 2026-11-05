"use client";

import { useState } from "react";
import type { BibleAssetType, BreakdownDocument } from "@storyflow/shared/breakdown";

const TABS: [BibleAssetType, string][] = [
  ["CHARACTER", "Characters"],
  ["SETTING", "Settings"],
  ["PROP", "Props"],
];

/** The asset bible, read-only (US1): characters, settings and props with aliases and variants. */
export function AssetBible({ doc }: { doc: BreakdownDocument }) {
  const [tab, setTab] = useState<BibleAssetType>("CHARACTER");
  const assets = doc.assets.filter((a) => a.type === tab);
  return (
    <section className="space-y-3 rounded border border-slate-800 p-4 text-sm">
      <div className="flex items-center gap-2">
        <h2 className="mr-2 text-base font-semibold">Asset bible</h2>
        {TABS.map(([type, label]) => (
          <button
            key={type}
            type="button"
            onClick={() => setTab(type)}
            className={`rounded px-2 py-0.5 text-xs ${tab === type ? "bg-sky-500 text-slate-950" : "bg-slate-800 text-slate-300"}`}
          >
            {label} ({doc.assets.filter((a) => a.type === type).length})
          </button>
        ))}
      </div>
      {assets.length === 0 && <p className="text-slate-500">None.</p>}
      <ul className="space-y-3">
        {assets.map((a) => (
          <li key={a.id} id={`asset-${a.id}`} className="rounded bg-slate-900/60 p-3">
            <p className="font-semibold">
              {a.name}
              {a.libraryAssetId && <span className="ml-2 rounded bg-violet-900 px-1.5 text-xs text-violet-200">library</span>}
            </p>
            {a.aliases.length > 0 && <p className="text-xs text-slate-400">Also: {a.aliases.join(", ")}</p>}
            {a.description && <p className="mt-1 whitespace-pre-wrap text-slate-300">{a.description}</p>}
            <ul className="mt-2 flex flex-wrap gap-2">
              {a.variants.map((v) => (
                <li key={v.id} className="rounded border border-slate-700 px-2 py-1 text-xs" title={v.description}>
                  {v.name}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
