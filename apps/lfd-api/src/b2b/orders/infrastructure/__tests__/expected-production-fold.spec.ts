import { SaleSkuAliases } from "../../../catalog/domain/sale-sku-aliases.js";
import { P_X_ALIASED } from "../../../catalog/domain/__tests__/sale-sku-alias.doubles.js";
import { foldExpectedByArticle, type ExpectedOrderRow } from "../expected-production-fold.js";

/**
 * Le prévisionnel du fournil se plie par ARTICLE : la journée de la bascule
 * porte des lignes `P-X` passées avant et des lignes `P-X-1` passées après
 * (`plan-defaut-sous-sa-reference.md`, § 2 b). Les dates sont des jours de
 * service comparés entre eux, jamais à l'horloge.
 */
const DAY = new Date("2030-01-07T00:00:00.000Z");

function order(...lines: [sku: string, quantity: number][]): ExpectedOrderRow {
  return {
    requestedDeliveryDate: DAY,
    lines: lines.map(([sku, quantity]) => ({
      sku,
      productNameSnapshot: `Nom ${sku}`,
      quantity,
      saleUnit: "piece",
    })),
  };
}

describe("foldExpectedByArticle — une ligne par article au fournil", () => {
  it("une journée mixte P-X + P-X-1 sort une seule ligne par article", () => {
    const rows = [order(["P-X", 3]), order(["P-X-1", 2], ["P-Y", 1])];

    const [day] = foldExpectedByArticle(rows, SaleSkuAliases.of(P_X_ALIASED));

    expect(day?.items).toEqual([
      { sku: "P-X-1", productName: "Nom P-X", quantity: 5, saleUnit: "piece" },
      { sku: "P-Y", productName: "Nom P-Y", quantity: 1, saleUnit: "piece" },
    ]);
    expect(day?.orderCount).toBe(2);
  });

  it("ne fusionne pas deux déclinaisons de la même fiche", () => {
    const [day] = foldExpectedByArticle(
      [order(["P-X-1", 2], ["P-X-2", 4])],
      SaleSkuAliases.of(P_X_ALIASED),
    );
    expect(day?.items.map((item) => item.sku)).toEqual(["P-X-1", "P-X-2"]);
  });

  it("table vide : chaque référence reste sa propre ligne, comme avant le L1", () => {
    const [day] = foldExpectedByArticle(
      [order(["P-X", 3]), order(["P-X-1", 2])],
      SaleSkuAliases.none(),
    );
    expect(day?.items.map((item) => [item.sku, item.quantity])).toEqual([
      ["P-X", 3],
      ["P-X-1", 2],
    ]);
  });
});
