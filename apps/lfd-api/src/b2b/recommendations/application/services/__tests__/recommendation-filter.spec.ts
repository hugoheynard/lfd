import { addDays, localToInstant, type OrderCutoffView } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import type { UnsealedCatalogItem } from "../../../../catalog/domain/ports/product-catalog.reader.js";
import { RecommendationCutoffReader } from "../../../domain/ports/recommendation-cutoff.reader.js";
import { RecommendationFilter } from "../recommendation-filter.js";

// Dates comparées au `FixedClock` de la fixture, jamais à l'horloge réelle.
const TODAY = "2026-03-10";
const TOMORROW = addDays(TODAY, 1);

class StubCutoffs extends RecommendationCutoffReader {
  calls = 0;
  constructor(private readonly rules: readonly OrderCutoffView[]) {
    super();
  }
  list(): Promise<readonly OrderCutoffView[]> {
    this.calls += 1;
    return Promise.resolve(this.rules);
  }
}

function item(
  sku: string,
  orderTimeLimit: UnsealedCatalogItem["orderTimeLimit"],
): UnsealedCatalogItem {
  return {
    sku,
    name: sku,
    unitPriceMillicents: 100_000,
    vatRate: 5.5,
    family: null,
    allergens: null,
    orderTimeLimit,
  };
}

function clock(): FixedClock {
  const instant = localToInstant(TODAY, "10:00");
  if (instant === null) {
    throw new RangeError(`10:00 n'existe pas le ${TODAY} à Paris`);
  }
  return new FixedClock(instant);
}

const catalog = new InMemoryProductCatalog([
  item("OPEN", { daysBefore: 1, time: "18:00", graceMinutes: 0 }),
  item("CLOSED", { daysBefore: 1, time: "09:00", graceMinutes: 0 }),
  item("COMMERCE", null),
  item("IN_CART", null),
]);

describe("RecommendationFilter", () => {
  it("retire l'inconnu du catalogue servi, le fermé et le panier, dans l'ordre des candidats", async () => {
    const cutoffs = new StubCutoffs([]);
    const filter = new RecommendationFilter(catalog, cutoffs, clock());

    const kept = await filter.keep({
      candidates: ["UNKNOWN", "COMMERCE", "CLOSED", "IN_CART", "OPEN"],
      audience: "public",
      inCart: ["IN_CART"],
      target: { date: TOMORROW, pickupAddressId: null },
    });

    expect(kept.map((entry) => entry.sku)).toEqual(["COMMERCE", "OPEN"]);
    expect(cutoffs.calls).toBe(1);
  });

  it("ne lit pas les règles du commerce sans jour visé", async () => {
    const cutoffs = new StubCutoffs([]);
    const filter = new RecommendationFilter(catalog, cutoffs, clock());

    const kept = await filter.keep({
      candidates: ["CLOSED"],
      audience: "pro",
      inCart: [],
      target: null,
    });

    expect(kept.map((entry) => entry.sku)).toEqual(["CLOSED"]);
    expect(cutoffs.calls).toBe(0);
  });

  it("rend vide sans candidat, sans rien lire", async () => {
    const cutoffs = new StubCutoffs([]);
    const filter = new RecommendationFilter(catalog, cutoffs, clock());

    await expect(
      filter.keep({ candidates: [], audience: "pro", inCart: [], target: null }),
    ).resolves.toEqual([]);
  });
});
