import { CategoryContextRatesReader } from "../../pim/catalogue/category/domain/ports/category-context-rates.reader.js";
import { ProductContextRatesReader } from "../../pim/catalogue/product/domain/ports/product-context-rates.reader.js";
import { PimCatalogueSalesContextRatings } from "../pim-catalogue-sales-context-ratings.js";
import { PimCatalogueSalesContextUsage } from "../pim-catalogue-sales-context-usage.js";

class CountedFamilies extends CategoryContextRatesReader {
  constructor(private readonly counts: Readonly<Record<string, number>>) {
    super();
  }
  countIn(contextId: string): Promise<number> {
    return Promise.resolve(this.counts[contextId] ?? 0);
  }
  countByContext(): Promise<ReadonlyMap<string, number>> {
    return Promise.resolve(new Map(Object.entries(this.counts)));
  }
}

class CountedProducts extends ProductContextRatesReader {
  constructor(private readonly counts: Readonly<Record<string, number>>) {
    super();
  }
  countIn(contextId: string): Promise<number> {
    return Promise.resolve(this.counts[contextId] ?? 0);
  }
  countByContext(): Promise<ReadonlyMap<string, number>> {
    return Promise.resolve(new Map(Object.entries(this.counts)));
  }
}

describe("PimCatalogueSalesContextUsage — ce qui retient un contexte à l'archive", () => {
  it("additionne les familles ET les fiches qui y règlent un taux", async () => {
    const usage = new PimCatalogueSalesContextUsage(
      new CountedFamilies({ ctx_b2b: 2 }),
      new CountedProducts({ ctx_b2b: 3 }),
    );

    expect(await usage.ratedBy("ctx_b2b")).toBe(5);
  });

  it("compte un contexte réglé par une seule fiche — l'oubli laisserait l'archiver", async () => {
    const usage = new PimCatalogueSalesContextUsage(
      new CountedFamilies({}),
      new CountedProducts({ ctx_brunch: 1 }),
    );

    expect(await usage.ratedBy("ctx_brunch")).toBe(1);
  });
});

describe("PimCatalogueSalesContextRatings — ce qui retient chaque contexte, pour la liste", () => {
  it("additionne par contexte, et omet un contexte que rien ne retient", async () => {
    const ratings = new PimCatalogueSalesContextRatings(
      new CountedFamilies({ ctx_b2b: 2, ctx_takeaway: 1 }),
      new CountedProducts({ ctx_b2b: 3, ctx_brunch: 1 }),
    );

    const rated = await ratings.ratedByContext();

    expect(Object.fromEntries(rated)).toEqual({ ctx_b2b: 5, ctx_takeaway: 1, ctx_brunch: 1 });
    expect(rated.has("ctx_eat_in")).toBe(false);
  });
});
