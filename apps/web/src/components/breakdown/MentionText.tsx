import { labelFor, MENTION_TOKEN, type BreakdownDocument } from "@storyflow/shared/breakdown";

/** Shot text with `@{variantId}` tokens shown as chips (R11 read mode). */
export function MentionText({ text, doc }: { text: string; doc: BreakdownDocument }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(new RegExp(MENTION_TOKEN.source, "g"))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const label = labelFor(doc, m[1]!);
    parts.push(
      <span
        key={m.index}
        className={`mx-0.5 rounded px-1 text-xs ${label ? "bg-sky-900 text-sky-200" : "bg-red-900 text-red-200"}`}
      >
        {label ?? "@missing"}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
