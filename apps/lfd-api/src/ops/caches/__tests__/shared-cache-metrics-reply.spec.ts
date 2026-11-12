import { sharedCacheMetricsReplyOf } from "../shared-cache-metrics-reply.js";

/** La lecture sur le fil : une ligne mal formée rend toute la réponse illisible. */
const ROW = {
  cache: "pim-product",
  hourMs: 3_600_000,
  hits: 1,
  misses: 2,
  stores: 3,
  tooLarge: 0,
  bytes: null,
  entries: 4,
  persons: 1,
};

describe("sharedCacheMetricsReplyOf", () => {
  it("lit les heures et les pics", () => {
    expect(
      sharedCacheMetricsReplyOf({ rows: [ROW], peaks: [{ hourMs: 3_600_000, perSecond: 7 }] }),
    ).toEqual({ hours: [ROW], peaks: [{ hourMs: 3_600_000, perSecond: 7 }] });
  });

  it.each([
    ["sans pics", { rows: [ROW] }],
    ["un compte négatif", { rows: [{ ...ROW, hits: -1 }], peaks: [] }],
    ["une taille en texte", { rows: [{ ...ROW, bytes: "12" }], peaks: [] }],
    ["autre chose qu'un objet", "rows"],
  ])("refuse une réponse %s", (_case, raw) => {
    expect(sharedCacheMetricsReplyOf(raw)).toBeNull();
  });
});
