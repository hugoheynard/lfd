import type { CustomerSkuTally } from "../../ports/customer-sku.reader.js";
import { regroupByLineage } from "../customer-sku-lineage.js";

/** Dates comparées entre elles seulement : la plus récente gagne le nom de repli. */
const tally = (sku: string, orders: number, at: string, name = sku): CustomerSkuTally => ({
  sku,
  lastProductName: name,
  orderCount: orders,
  totalQuantity: orders * 10,
  totalCents: orders * 100,
  lastOrderedAt: new Date(at),
});

describe("regroupByLineage", () => {
  it("laisse intacts les comptes sans lignée", () => {
    const tallies = [tally("A", 3, "2026-05-01"), tally("B", 1, "2026-05-02")];

    expect(regroupByLineage(tallies, new Map())).toEqual(tallies);
  });

  it("réunit l'ancienne et la nouvelle référence sous la plus récente", () => {
    const regrouped = regroupByLineage(
      [tally("OLD", 2, "2026-05-01", "Ancien nom"), tally("NEW", 1, "2026-06-01", "Nouveau nom")],
      new Map([["OLD", "NEW"]]),
    );

    expect(regrouped).toEqual([
      {
        sku: "NEW",
        lastProductName: "Nouveau nom",
        orderCount: 3,
        totalQuantity: 30,
        totalCents: 300,
        lastOrderedAt: new Date("2026-06-01"),
      },
    ]);
  });

  it("garde le nom de la commande la plus récente, même sous l'ancienne référence", () => {
    const [line] = regroupByLineage(
      [tally("NEW", 1, "2026-04-01", "Nouveau"), tally("OLD", 1, "2026-07-01", "Ancien")],
      new Map([["OLD", "NEW"]]),
    );

    expect(line).toMatchObject({ sku: "NEW", lastProductName: "Ancien" });
  });

  it("reclasse après la réunion : la ligne réunie peut passer devant", () => {
    const regrouped = regroupByLineage(
      [tally("C", 3, "2026-05-01"), tally("OLD", 2, "2026-05-01"), tally("NEW", 2, "2026-05-02")],
      new Map([["OLD", "NEW"]]),
    );

    expect(regrouped.map((line) => [line.sku, line.orderCount])).toEqual([
      ["NEW", 4],
      ["C", 3],
    ]);
  });
});
