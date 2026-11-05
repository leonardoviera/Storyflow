"use client";

import type { Flag } from "@storyflow/shared/breakdown";
import { scrollToPath } from "./anchors";

/** Validation flags (FR-019); clicking one scrolls to the item it points at. */
export function FlagsPanel({ flags }: { flags: Flag[] }) {
  const blocking = flags.filter((f) => f.blocksBuild).length;
  return (
    <section className="space-y-2 rounded border border-slate-800 p-4 text-sm">
      <h2 className="text-base font-semibold">
        Flags{" "}
        <span className="text-xs font-normal text-slate-400">
          ({flags.length}
          {blocking ? `, ${blocking} blocking the build` : ""})
        </span>
      </h2>
      {flags.length === 0 && <p className="text-slate-500">No problems found.</p>}
      <ul className="space-y-1">
        {flags.map((f, i) => (
          <li key={`${f.path}-${f.code}-${i}`}>
            <button
              type="button"
              onClick={() => scrollToPath(f.path)}
              className={`w-full rounded px-2 py-1 text-left hover:bg-slate-800 ${
                f.blocksBuild ? "text-red-300" : f.code === "VERBATIM_DRIFT" ? "text-slate-400" : "text-amber-300"
              }`}
            >
              <span className="font-mono text-xs">{f.code}</span> {f.message}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
