import {
  CategoryRateUsageReader,
  type RateContextTally,
} from "../../pim/catalogue/category/domain/ports/category-rate-usage.reader.js";
import { ProductRateUsageReader } from "../../pim/catalogue/product/domain/ports/product-rate-usage.reader.js";
import { SalesContextKeysReader } from "../../pim/reference/sales-contexts/domain/ports/sales-context-keys.reader.js";
import { PimCatalogueVatRateContextUsage } from "../pim-catalogue-vat-rate-context-usage.js";

class TalliedFamilies extends CategoryRateUsageReader {
  constructor(private readonly rows: readonly RateContextTally[]) {
    super();
  }
  tallies(): Promise<readonly RateContextTally[]> {
    return Promise.resolve(this.rows);
  }
}

class TalliedProducts extends ProductRateUsageReader {
  constructor(private readonly rows: readonly RateContextTally[]) {
    super();
  }
  tallies(): Promise<readonly RateContextTally[]> {
    return Promise.resolve(this.rows);
  }
}

class KnownKeys extends SalesContextKeysReader {
  keysById(): Promise<ReadonlyMap<string, string>> {
    return Promise.resolve(
      new Map([
        ["ctx_takeaway", "takeaway"],
        ["ctx_b2b", "b2b"],
      ]),
    );
  }
}

describe("PimCatalogueVatRateContextUsage — l'usage d'un taux par contexte", () => {
  it("additionne familles et fiches dans le même contexte, nommé par sa clé", async () => {
    const usage = new PimCatalogueVatRateContextUsage(
      new TalliedFamilies([
        { vatRateId: "tva_20", contextId: "ctx_takeaway", count: 2 },
        { vatRateId: "tva_20", contextId: "ctx_b2b", count: 1 },
      ]),
      new TalliedProducts([
        { vatRateId: "tva_20", contextId: "ctx_takeaway", count: 3 },
        { vatRateId: "tva_55", contextId: "ctx_b2b", count: 1 },
      ]),
      new KnownKeys(),
    );

    const byRate = await usage.usageByRegime();

    expect(byRate.get("tva_20")).toEqual({ takeaway: 5, b2b: 1 });
    expect(byRate.get("tva_55")).toEqual({ b2b: 1 });
  });

  it("compte un taux visé par une seule dérogation de fiche", async () => {
    const usage = new PimCatalogueVatRateContextUsage(
      new TalliedFamilies([]),
      new TalliedProducts([{ vatRateId: "tva_10", contextId: "ctx_b2b", count: 1 }]),
      new KnownKeys(),
    );

    expect((await usage.usageByRegime()).get("tva_10")).toEqual({ b2b: 1 });
  });

  it("ne compte pas une ligne dont le contexte est inconnu, et omet un taux sans usage", async () => {
    const usage = new PimCatalogueVatRateContextUsage(
      new TalliedFamilies([{ vatRateId: "tva_0", contextId: "ctx_gone", count: 4 }]),
      new TalliedProducts([]),
      new KnownKeys(),
    );

    expect((await usage.usageByRegime()).has("tva_0")).toBe(false);
  });
});
