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
  rawBytes: 40,
  tooOld: 2,
};

describe("sharedCacheMetricsReplyOf", () => {
  it("lit les heures et les pics", () => {
    expect(
      sharedCacheMetricsReplyOf({ rows: [ROW], peaks: [{ hourMs: 3_600_000, perSecond: 7 }] }),
    ).toEqual({ hours: [ROW], peaks: [{ hourMs: 3_600_000, perSecond: 7 }] });
  });

  it("lit une ligne d'un objet d'une image antérieure : taille en clair inconnue, rien de trop vieux", () => {
    const { rawBytes: _raw, tooOld: _old, ...older } = ROW;
    expect(sharedCacheMetricsReplyOf({ rows: [older], peaks: [] })).toEqual({
      hours: [{ ...ROW, rawBytes: null, tooOld: 0 }],
      peaks: [],
    });
  });

  it.each([
    ["sans pics", { rows: [ROW] }],
    ["un compte négatif", { rows: [{ ...ROW, hits: -1 }], peaks: [] }],
    ["une taille en texte", { rows: [{ ...ROW, bytes: "12" }], peaks: [] }],
    ["une taille en clair négative", { rows: [{ ...ROW, rawBytes: -1 }], peaks: [] }],
    ["un compte trop vieux en texte", { rows: [{ ...ROW, tooOld: "1" }], peaks: [] }],
    ["autre chose qu'un objet", "rows"],
  ])("refuse une réponse %s", (_case, raw) => {
    expect(sharedCacheMetricsReplyOf(raw)).toBeNull();
  });
});
