/** DOM id for a document path, e.g. episodes[1].segments[3].shots[0] → bd-episodes-1-segments-3-shots-0. */
export function anchorFor(path: string): string {
  return `bd-${path.replace(/\[(\d+)\]/g, "-$1").replace(/\./g, "-")}`;
}

/** Scroll to the nearest element the tree renders for a flag path (lines live inside their shot). */
export function scrollToPath(path: string) {
  const parts = path.split(".");
  while (parts.length > 0) {
    const el = document.getElementById(anchorFor(parts.join(".")));
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-amber-400");
      setTimeout(() => el.classList.remove("ring-2", "ring-amber-400"), 1500);
      return;
    }
    parts.pop();
  }
}
