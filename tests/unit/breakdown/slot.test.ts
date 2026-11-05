import { describe, expect, it } from "vitest";
import { withLlmSlot } from "../../../packages/shared/src/llm/slot";

describe("withLlmSlot", () => {
  it("runs one call at a time, in FIFO order, even when one throws", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const order: number[] = [];
    const call = (n: number, fail = false) =>
      withLlmSlot(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        order.push(n);
        inFlight -= 1;
        if (fail) throw new Error(`call ${n} failed`);
        return n;
      });
    const results = await Promise.allSettled([call(1), call(2, true), call(3)]);
    expect(maxInFlight).toBe(1);
    expect(order).toEqual([1, 2, 3]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
  });
});
