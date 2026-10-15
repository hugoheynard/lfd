import { MonotonicStopwatch } from "../monotonic-stopwatch.js";

describe("MonotonicStopwatch", () => {
  it("rend une durée positive ou nulle, qui ne recule pas", () => {
    const elapsed = new MonotonicStopwatch().start();

    const first = elapsed();
    const second = elapsed();

    expect(first).toBeGreaterThanOrEqual(0);
    expect(second).toBeGreaterThanOrEqual(first);
  });
});
