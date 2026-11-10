import { OrderLine } from "../order-line.js";

/**
 * Le marqueur « sur mesure » se scelle sur la ligne comme son prix (plan
 * `documentation/catalogue/plan-sur-mesure-partout.md`, M1) : ce que la ligne
 * reçoit à sa création est ce qu'elle rend, et l'absence reste une absence.
 */
const base = {
  sku: "GAT-001",
  productName: "Gâteau d'anniversaire",
  unitPriceMillicents: 3_000_000,
  vatRate: 5.5,
  saleUnit: "piece" as const,
  quantity: 1,
};

describe("OrderLine — le marqueur « sur mesure »", () => {
  it("scelle `true` reçu de la composition", () => {
    expect(OrderLine.create({ ...base, madeToOrder: true }, "pro").toSnapshot().madeToOrder).toBe(
      true,
    );
  });

  it("scelle `false` affirmé", () => {
    expect(
      OrderLine.create({ ...base, madeToOrder: false }, "public").toSnapshot().madeToOrder,
    ).toBe(false);
  });

  it("rend `null`, jamais `false`, quand personne ne l'a dit", () => {
    expect(OrderLine.create(base, "pro").toSnapshot().madeToOrder).toBeNull();
  });

  it("le scelle aussi sur une ligne composée en taxe comprise", () => {
    const line = OrderLine.ofTtc(
      { ...base, madeToOrder: true },
      { vatRate: 5.5, labelCents: 3_165, ttcCents: 3_165, htCents: 3_000 },
    );
    expect(line.toSnapshot().madeToOrder).toBe(true);
  });
});
