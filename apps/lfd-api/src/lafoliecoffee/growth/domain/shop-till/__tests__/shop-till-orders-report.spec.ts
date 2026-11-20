import { ShopTillOrdersReportPeriodError } from "../../errors/shop-till-orders-report-errors.js";
import {
  ShopTillOrdersPeriod,
  shopTillOrdersRowsOf,
  type ShopTillOrderEntry,
} from "../shop-till-orders-report.js";

// Des jours comparés entre eux seulement, jamais à l'horloge (exception étroite du §5).
const entry = (over: Partial<ShopTillOrderEntry> = {}): ShopTillOrderEntry => ({
  day: "2026-11-21",
  siteId: "site_a",
  pickupLabel: "Boutique Croix-Rousse",
  totalCents: 1_000,
  handedOver: false,
  ...over,
});

describe("shopTillOrdersRowsOf — le montant commandé, par jour et par point", () => {
  it("additionne le commandé, et la part remise à part", () => {
    const rows = shopTillOrdersRowsOf([
      entry({ totalCents: 1_840, handedOver: true }),
      entry({ totalCents: 920 }),
    ]);

    expect(rows).toEqual([
      {
        day: "2026-11-21",
        siteId: "site_a",
        pickupLabel: "Boutique Croix-Rousse",
        orderedTtcCents: 2_760,
        orderedCount: 2,
        handedOverTtcCents: 1_840,
        handedOverCount: 1,
      },
    ]);
  });

  it("sépare deux points et deux jours, par jour puis par nom de point", () => {
    const rows = shopTillOrdersRowsOf([
      entry({ day: "2026-11-22" }),
      entry({ siteId: "site_b", pickupLabel: "Atelier" }),
      entry(),
    ]);

    expect(rows.map((row) => [row.day, row.pickupLabel])).toEqual([
      ["2026-11-21", "Atelier"],
      ["2026-11-21", "Boutique Croix-Rousse"],
      ["2026-11-22", "Boutique Croix-Rousse"],
    ]);
  });

  it("ne rend aucune ligne sans commande", () => {
    expect(shopTillOrdersRowsOf([])).toEqual([]);
  });
});

describe("ShopTillOrdersPeriod", () => {
  it("garde deux bornes valides", () => {
    expect(ShopTillOrdersPeriod.of("2026-11-01", "2026-11-30", 366)).toMatchObject({
      from: "2026-11-01",
      to: "2026-11-30",
    });
  });

  it.each([
    ["un jour impossible", "2026-02-31", "2026-03-01"],
    ["une fin avant le début", "2026-11-30", "2026-11-01"],
    ["une période trop longue", "2025-01-01", "2026-11-30"],
  ])("refuse %s", (_case, from, to) => {
    expect(() => ShopTillOrdersPeriod.of(from, to, 366)).toThrow(ShopTillOrdersReportPeriodError);
  });
});
