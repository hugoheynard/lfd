import { resolveCacheMetricsDays } from "../cache-metrics-days.js";

describe("resolveCacheMetricsDays", () => {
  it.each([
    [undefined, 30],
    ["7", 7],
    ["0", 1],
    ["90", 30],
    ["abc", 30],
    ["-3", 30],
  ])("%s → %i", (raw, expected) => {
    expect(resolveCacheMetricsDays(raw)).toBe(expected);
  });
});
