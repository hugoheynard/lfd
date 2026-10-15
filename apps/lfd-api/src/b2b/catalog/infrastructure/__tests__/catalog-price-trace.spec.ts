import { priceTraceRows } from "../catalog-price-trace.js";

/** L'instant d'écriture — comparé à rien d'autre qu'à lui-même. */
const AT = new Date("2026-10-15T08:00:00.000Z");

const line = (pimPriceMillicents: number, vatRatePercent: number | null = 5.5) => ({
  sku: "VIE-001-1",
  productSku: "VIE-001",
  pimPriceMillicents,
  vatRatePercent,
});

/**
 * La règle partagée de la trace du tarif. Depuis le lot D (2026-10-15), elle
 * ne connaît plus de prix décidé : elle trace le prix du référentiel, source
 * `pim`, et seulement sur un écart du couple prix + taux.
 */
describe("priceTraceRows", () => {
  it("trace le prix du référentiel quand la dernière trace était un ancien prix décidé", () => {
    const recorded = new Map([["VIE-001-1", { priceMillicents: 180_000, vatRatePercent: 5.5 }]]);

    const rows = priceTraceRows([line(210_000)], recorded, () => "ph_1", AT);

    expect(rows).toEqual([
      {
        id: "ph_1",
        sku: "VIE-001-1",
        productSku: "VIE-001",
        priceMillicents: 210_000,
        vatRatePercent: 5.5,
        source: "pim",
        recordedAt: AT,
      },
    ]);
  });

  it("n'écrit rien quand la dernière trace est déjà ce couple", () => {
    const recorded = new Map([["VIE-001-1", { priceMillicents: 210_000, vatRatePercent: 5.5 }]]);

    expect(priceTraceRows([line(210_000)], recorded, () => "ph_1", AT)).toEqual([]);
  });

  it("trace un changement de taux seul — la bascule d'un taux légal se voit", () => {
    const recorded = new Map([["VIE-001-1", { priceMillicents: 210_000, vatRatePercent: 5.5 }]]);

    expect(priceTraceRows([line(210_000, 10)], recorded, () => "ph_1", AT)).toHaveLength(1);
  });

  it("trace un article jamais tracé", () => {
    expect(priceTraceRows([line(210_000)], new Map(), () => "ph_1", AT)).toHaveLength(1);
  });
});
