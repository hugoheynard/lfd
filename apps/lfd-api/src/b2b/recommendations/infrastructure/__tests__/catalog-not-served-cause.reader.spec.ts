import type { CatalogAdminItemView } from "@lfd/contracts";

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
  const reader = new CatalogNotServedCauseReader(admin);

  it("nomme retiré, hors gamme, masqué — et hors gamme pour une validation en attente", async () => {
    const causes = await reader.causesOf(
      ["GONE", "PRO-ONLY", "HIDDEN-PUBLIC", "PENDING"],
      "public",
    );
    expect([...causes]).toEqual([
      ["GONE", "withdrawn"],
      ["PRO-ONLY", "not_for_audience"],
      ["HIDDEN-PUBLIC", "hidden_for_audience"],
      ["PENDING", "not_for_audience"],
    ]);
    expect((await reader.causesOf(["HIDDEN-PRO"], "pro")).get("HIDDEN-PRO")).toBe(
      "hidden_for_audience",
    );
  });

  it("ne lit pas le paramétrage sans SKU à expliquer", async () => {
    const quiet = new Admin([]);
    expect((await new CatalogNotServedCauseReader(quiet).causesOf([], "pro")).size).toBe(0);
    expect(quiet.calls).toBe(0);
  });
});
