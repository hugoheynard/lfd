import { ReservedArticleRefusedError } from "../../../../catalog/domain/errors/reserved-article-refused.error.js";
import { catalogItem, quotingOf } from "./shop-cart-quoting.doubles.js";

/**
 * **Le devis contre un article réservé à un autre compte**
 * (`documentation/catalogue/plan-articles-sur-mesure.md`, S2) : le catalogue
 * le rend verrouillé (`reservation: "other"`), la porte du prix le refuse par
 * son nom avant toute lecture de prix — distinct d'un article inconnu.
 */

const OPEN = catalogItem("VIE-001", "Croissant", 200_000, 5.5);
const LOCKED = {
  ...catalogItem("SUR-001", "Brioche signature", 400_000, 5.5),
  reservation: "other" as const,
};
const MINE = {
  ...catalogItem("SUR-002", "Pain du chef", 300_000, 5.5),
  reservation: "mine" as const,
};

const PRO = { companyId: "co_b", buyerUserId: "user_b" } as const;

function quoting() {
  return quotingOf({ catalog: [OPEN, LOCKED, MINE], companyStatus: "active" });
}

describe("ShopCartQuoting — les articles réservés", () => {
  it("refuse un article réservé à un autre compte, en le nommant", async () => {
    const refusal = quoting().quote({
      ...PRO,
      payload: {
        lines: [
          { sku: "VIE-001", quantity: 6 },
          { sku: "SUR-001", quantity: 2 },
        ],
        fulfillment: null,
      },
    });

    await expect(refusal).rejects.toThrow(ReservedArticleRefusedError);
    await expect(refusal).rejects.toMatchObject({
      code: "catalog.reserved_article",
      sku: "SUR-001",
    });
  });

  it("chiffre ce qui lui est réservé, comme un article ouvert", async () => {
    const { view } = await quoting().quote({
      ...PRO,
      payload: { lines: [{ sku: "SUR-002", quantity: 1 }], fulfillment: null },
    });

    expect(view.lines).toEqual([expect.objectContaining({ sku: "SUR-002", quantity: 1 })]);
  });
});
