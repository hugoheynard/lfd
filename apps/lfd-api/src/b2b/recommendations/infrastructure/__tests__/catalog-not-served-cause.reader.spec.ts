import type { CatalogAdminItemView } from "@lfd/contracts";

import { TableSaleSkuAliasReader } from "../../../catalog/domain/__tests__/sale-sku-alias.doubles.js";
import { CatalogAdminReader } from "../../../catalog/domain/ports/catalog-admin.reader.js";
import { CatalogNotServedCauseReader } from "../catalog-not-served-cause.reader.js";

function variant(
  productSku: string,
  over: Partial<CatalogAdminItemView> = {},
): CatalogAdminItemView {
  return {
    sku: `${productSku}-1`,
    productSku,
    name: productSku,
    categoryId: "fam",
    categoryName: "Famille",
    pimPriceMillicents: 100_000,
    publicTtcCents: 120,
    publicVatRatePercent: 5.5,
    vatRatePercent: 5.5,
    allergens: null,
    allergensIncomplete: false,
    isHidden: false,
    isHiddenPublic: false,
    audience: "both",
    publicReviewPending: false,
    proReviewPending: false,
    isFeaturedPro: false,
    isFeaturedPublic: false,
    operationOnly: false,
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    receivedAt: "2026-10-01T08:00:00.000Z",
    ...over,
  };
}

class Admin extends CatalogAdminReader {
  calls = 0;
  constructor(private readonly items: CatalogAdminItemView[]) {
    super();
  }
  list(): Promise<CatalogAdminItemView[]> {
    this.calls += 1;
    return Promise.resolve(this.items);
  }
}

describe("CatalogNotServedCauseReader", () => {
  const admin = new Admin([
    variant("PRO-ONLY", { audience: "pro" }),
    variant("HIDDEN-PUBLIC", { isHiddenPublic: true }),
    variant("HIDDEN-PRO", { isHidden: true }),
    variant("PENDING", { publicReviewPending: true }),
  ]);
  const reader = new CatalogNotServedCauseReader(admin, new TableSaleSkuAliasReader());

  it("nomme retiré, hors gamme, masqué — et hors gamme pour une validation en attente", async () => {
    const causes = await reader.causesOf(
      ["GONE-1", "PRO-ONLY-1", "HIDDEN-PUBLIC-1", "PENDING-1"],
      "public",
    );
    expect([...causes]).toEqual([
      ["GONE-1", "withdrawn"],
      ["PRO-ONLY-1", "not_for_audience"],
      ["HIDDEN-PUBLIC-1", "hidden_for_audience"],
      ["PENDING-1", "not_for_audience"],
    ]);
    expect((await reader.causesOf(["HIDDEN-PRO-1"], "pro")).get("HIDDEN-PRO-1")).toBe(
      "hidden_for_audience",
    );
  });

  /**
   * Bascule (`plan-defaut-sous-sa-reference.md`, L3) : la cause se lisait sur
   * toutes les déclinaisons de la fiche, par référence produit.
   */
  it("juge l'article seul, et une ancienne référence comme sa cible", async () => {
    const twoVariants = new Admin([
      variant("TWO", { audience: "pro" }),
      variant("TWO", { sku: "TWO-2", audience: "both", isHiddenPublic: true }),
    ]);
    const aliased = new CatalogNotServedCauseReader(
      twoVariants,
      new TableSaleSkuAliasReader([{ aliasSku: "TWO", targetSku: "TWO-1" }]),
    );
    const causes = await aliased.causesOf(["TWO", "TWO-2"], "public");
    expect([...causes]).toEqual([
      ["TWO", "not_for_audience"],
      ["TWO-2", "hidden_for_audience"],
    ]);
  });

  it("ne lit pas le paramétrage sans SKU à expliquer", async () => {
    const quiet = new Admin([]);
    expect(
      (
        await new CatalogNotServedCauseReader(quiet, new TableSaleSkuAliasReader()).causesOf(
          [],
          "pro",
        )
      ).size,
    ).toBe(0);
    expect(quiet.calls).toBe(0);
  });
});
