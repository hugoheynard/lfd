import type { ProductAudienceCounterView } from "@lfd/contracts";

import { SaleSkuAliases } from "../../../catalog/domain/sale-sku-aliases.js";
import { P_X_ALIASED } from "../../../catalog/domain/__tests__/sale-sku-alias.doubles.js";
import { foldCountersByArticle } from "../audience-counters-by-article.js";

/** Les compteurs `growth` se lisent par article (`plan-defaut-sous-sa-reference.md`, § 2 a). */
function counter(sku: string, count: number): ProductAudienceCounterView {
  return {
    day: "2030-01-07",
    sku,
    event: "product_viewed",
    placement: "none",
    source: "none",
    count,
  };
}

describe("foldCountersByArticle", () => {
  it("additionne P-X et P-X-1 sous la cible, sans toucher P-X-2", () => {
    const folded = foldCountersByArticle(
      [counter("P-X", 3), counter("P-X-1", 2), counter("P-X-2", 5)],
      SaleSkuAliases.of(P_X_ALIASED),
    );
    expect(folded.map((view) => [view.sku, view.count])).toEqual([
      ["P-X-1", 5],
      ["P-X-2", 5],
    ]);
  });

  it("table vide : rend les compteurs tels quels", () => {
    const views = [counter("P-X", 3), counter("P-X-1", 2)];
    expect(foldCountersByArticle(views, SaleSkuAliases.none())).toEqual(views);
  });
});
