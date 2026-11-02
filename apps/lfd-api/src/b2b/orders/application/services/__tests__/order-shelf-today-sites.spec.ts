import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { GATE_NOW } from "../../commands/__tests__/plan-doubles.js";
import { OrderShelfTodaySites } from "../order-shelf-today-sites.js";
import { FixedShelfStock, FixedSiteDays, siteDay } from "./shelf-circuit-doubles.js";

/**
 * Les points qui vendent encore aujourd'hui sur leur vitrine (lot L4 du
 * circuit du jour J), pour `GET /fulfillment-days`. L'horloge est celle des
 * portes, le 1er janvier 2026 à midi à Paris ; `TODAY` ne lui est comparé
 * qu'à elle (exception étroite du CLAUDE.md §5).
 */

const TODAY = "2026-01-01";
const LATER = siteDay({ publicRules: [{ start: "16:00", end: "17:00", slotMinutes: 60 }] });
const OVER = siteDay({ publicRules: [{ start: "08:00", end: "09:00", slotMinutes: 60 }] });

function croissants(left: number) {
  return [
    {
      sku: "VIE-001-1",
      label: "Croissant",
      saleUnit: "piece" as const,
      receivedQuantity: 6,
      estimatedStock: left,
    },
  ];
}

function sitesWith(stock: FixedShelfStock): OrderShelfTodaySites {
  return new OrderShelfTodaySites(
    new FixedSiteDays(
      new Map([
        ["a", LATER],
        ["b", OVER],
        ["c", LATER],
      ]),
    ),
    stock,
    new FixedClock(GATE_NOW),
  );
}

describe("OrderShelfTodaySites", () => {
  it("garde les points qui ont un créneau après maintenant ET du stock pour tout le panier", async () => {
    const stock = new FixedShelfStock()
      .set(TODAY, "a", croissants(2))
      .set(TODAY, "b", croissants(2))
      .set(TODAY, "c", croissants(0));

    const selling = await sitesWith(stock).sellingToday({
      day: TODAY,
      audience: "public",
      siteIds: ["a", "b", "c"],
      cartSkus: ["VIE-001-1"],
    });

    expect([...selling]).toEqual(["a"]);
  });

  it("un panier mixte n'est pas proposé pour aujourd'hui", async () => {
    const stock = new FixedShelfStock().set(TODAY, "a", croissants(2));

    const selling = await sitesWith(stock).sellingToday({
      day: TODAY,
      audience: "public",
      siteIds: ["a"],
      cartSkus: ["VIE-001-1", "PAT-002-1"],
    });

    expect(selling.size).toBe(0);
  });

  it("sans panier : un point sans réassort reçu ne propose pas aujourd'hui", async () => {
    const stock = new FixedShelfStock().set(TODAY, "a", croissants(1));

    const selling = await sitesWith(stock).sellingToday({
      day: TODAY,
      audience: "public",
      siteIds: ["a", "c"],
      cartSkus: [],
    });

    expect([...selling]).toEqual(["a"]);
  });

  it("un pro suit la fenêtre pro, que ces points n'ont pas", async () => {
    const stock = new FixedShelfStock().set(TODAY, "a", croissants(2));

    const selling = await sitesWith(stock).sellingToday({
      day: TODAY,
      audience: "pro",
      siteIds: ["a"],
      cartSkus: [],
    });

    expect(selling.size).toBe(0);
  });
});
