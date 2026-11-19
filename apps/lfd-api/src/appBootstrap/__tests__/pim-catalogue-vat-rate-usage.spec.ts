import { CategoryVatHoldersReader } from "../../pim/catalogue/category/domain/ports/category-vat-holders.reader.js";
import { ProductVatHoldersReader } from "../../pim/catalogue/product/domain/ports/product-vat-holders.reader.js";
import { PimCatalogueVatRateUsage } from "../pim-catalogue-vat-rate-usage.js";

class CountedFamilies extends CategoryVatHoldersReader {
  constructor(private readonly counts: Readonly<Record<string, number>>) {
    super();
  }
  countHolding(rateId: string): Promise<number> {
    return Promise.resolve(this.counts[rateId] ?? 0);
  }
}

class CountedProducts extends ProductVatHoldersReader {
  constructor(private readonly counts: Readonly<Record<string, number>>) {
    super();
  }
  countHolding(rateId: string): Promise<number> {
    return Promise.resolve(this.counts[rateId] ?? 0);
  }
}

describe("PimCatalogueVatRateUsage — ce que le catalogue répond aux taux", () => {
  it("additionne les familles ET les fiches qui portent le taux", async () => {
    const usage = new PimCatalogueVatRateUsage(
      new CountedFamilies({ tva_20: 2 }),
      new CountedProducts({ tva_20: 3, tva_55: 1 }),
    );

    expect(await usage.holdersOf("tva_20")).toBe(5);
  });

  it("compte un taux porté par une seule famille — l'oubli d'un porteur laisserait l'archiver", async () => {
    const usage = new PimCatalogueVatRateUsage(
      new CountedFamilies({ tva_10: 1 }),
      new CountedProducts({}),
    );

    expect(await usage.holdersOf("tva_10")).toBe(1);
  });

  it("rend zéro pour un taux que personne ne porte", async () => {
    const usage = new PimCatalogueVatRateUsage(new CountedFamilies({}), new CountedProducts({}));

    expect(await usage.holdersOf("tva_0")).toBe(0);
  });
});
