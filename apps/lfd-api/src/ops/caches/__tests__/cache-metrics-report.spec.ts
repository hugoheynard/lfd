import { HOUR_MS, sharedCacheSeries, sharedObjectReports } from "../cache-metrics-report.js";
import type { SharedCacheHour, SharedObjectReading } from "../shared-cache-metrics.reader.js";

/**
 * L'agrégation de l'onglet Cache. Ces tests échouent si la tête mélange
 * l'heure en cours et la veille, si une heure sans relevé de taille se lit
 * comme un cache vide, ou si des personnes horaires s'additionnent.
 */
// Une heure ronde : seuls les écarts relatifs comptent.
const NOW = 2000 * HOUR_MS + 1234;
const CURRENT = 2000 * HOUR_MS;

function hour(hourMs: number, fields: Partial<SharedCacheHour> = {}): SharedCacheHour {
  return {
    cache: "pim-product",
    hourMs,
    hits: 0,
    misses: 0,
    stores: 0,
    tooLarge: 0,
    bytes: null,
    entries: null,
    persons: 0,
    ...fields,
  };
}

function reading(hours: readonly SharedCacheHour[]): SharedObjectReading {
  return { object: "day-versions", state: "read", hours, peaks: [] };
}

describe("sharedCacheSeries", () => {
  it("sépare l'heure en cours des 24 h, et calcule le taux de réussite", () => {
    const [series] = sharedCacheSeries(
      [
        reading([
          hour(CURRENT - 30 * HOUR_MS, { hits: 100 }),
          hour(CURRENT - 2 * HOUR_MS, { hits: 6, misses: 2, persons: 4 }),
          hour(CURRENT, { hits: 1, misses: 1, persons: 2, tooLarge: 1 }),
        ]),
      ],
      NOW,
    );

    expect(series?.lastHour).toMatchObject({ hits: 1, misses: 1, hitRate: 0.5, tooLarge: 1 });
    expect(series?.last24h).toMatchObject({ hits: 7, misses: 3, hitRate: 0.7, persons: 4 });
    expect(series?.points).toHaveLength(3);
  });

  it("reporte la dernière taille connue sur les heures sans relevé", () => {
    const [series] = sharedCacheSeries(
      [
        reading([
          hour(CURRENT - 2 * HOUR_MS, { stores: 1, bytes: 500, entries: 3 }),
          hour(CURRENT, { hits: 2 }),
        ]),
      ],
      NOW,
    );

    expect(series?.points.map((one) => one.bytes)).toEqual([500, 500]);
    expect(series?.lastHour).toMatchObject({ bytes: 500, entries: 3, hitRate: 1 });
  });

  it("n'invente pas de taux sans lecture", () => {
    const [series] = sharedCacheSeries([reading([hour(CURRENT, { stores: 1 })])], NOW);

    expect(series?.lastHour.hitRate).toBeNull();
    expect(series?.lastHour.bytes).toBeNull();
  });

  it("une série par cache, triée par nom, avec l'objet qui la garde", () => {
    const series = sharedCacheSeries(
      [
        reading([
          hour(CURRENT, { cache: "pim-product" }),
          hour(CURRENT, { cache: "catalog-admin" }),
        ]),
        {
          object: "pro-shelves",
          state: "read",
          hours: [hour(CURRENT, { cache: "pro-shelves" })],
          peaks: [],
        },
      ],
      NOW,
    );

    expect(series.map((one) => [one.cache, one.object])).toEqual([
      ["catalog-admin", "day-versions"],
      ["pim-product", "day-versions"],
      ["pro-shelves", "pro-shelves"],
    ]);
  });
});

describe("sharedObjectReports", () => {
  it("rend le pic de l'heure en cours et celui des 24 h", () => {
    const [report] = sharedObjectReports(
      [
        {
          object: "pro-shelves",
          state: "read",
          hours: [],
          peaks: [
            { hourMs: CURRENT, perSecond: 4 },
            { hourMs: CURRENT - 3 * HOUR_MS, perSecond: 9 },
            { hourMs: CURRENT - 40 * HOUR_MS, perSecond: 50 },
          ],
        },
      ],
      NOW,
    );

    expect(report).toMatchObject({ lastHourPeakPerSecond: 4, last24hPeakPerSecond: 9 });
    expect(report?.peaks.map((one) => one.perSecond)).toEqual([50, 9, 4]);
  });

  it("dit qu'un objet est injoignable plutôt que de rendre un zéro", () => {
    const [report] = sharedObjectReports(
      [{ object: "day-versions", state: "unreachable", hours: [], peaks: [] }],
      NOW,
    );

    expect(report).toMatchObject({ state: "unreachable", lastHourPeakPerSecond: null });
  });
});
