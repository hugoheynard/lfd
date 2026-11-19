import { CategoryNamesReader } from "../../pim/catalogue/category/domain/ports/category-names.reader.js";
import { ProductSkusReader } from "../../pim/catalogue/product/domain/ports/product-skus.reader.js";
import { PimCatalogueLimitTargetLabels } from "../pim-catalogue-limit-target-labels.js";

/** Rend ce qu'il connaît parmi les ids demandés, et garde les demandes. */
function known(
  table: Readonly<Record<string, string>>,
  asked: string[][],
): (ids: readonly string[]) => Promise<ReadonlyMap<string, string>> {
  return (ids) => {
    asked.push([...ids]);
    return Promise.resolve(
      new Map(ids.flatMap((id) => (table[id] === undefined ? [] : [[id, table[id]] as const]))),
    );
  };
}

class NamedFamilies extends CategoryNamesReader {
  readonly asked: string[][] = [];
  private readonly read = known({ cat_1: "Viennoiserie" }, this.asked);
  frenchNamesOf(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return this.read(ids);
  }
}

class KnownSkus extends ProductSkusReader {
  readonly askedProducts: string[][] = [];
  readonly askedVariants: string[][] = [];
  private readonly products = known({ prd_1: "ENT-001" }, this.askedProducts);
  private readonly variants = known({ var_1: "ENT-001-6P" }, this.askedVariants);
  productSkusOf(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return this.products(ids);
  }
  variantSkusOf(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return this.variants(ids);
  }
}

describe("PimCatalogueLimitTargetLabels — le nom des cibles d'une limite", () => {
  it("nomme une famille par son nom, un produit et une déclinaison par leur SKU", async () => {
    const families = new NamedFamilies();
    const skus = new KnownSkus();
    const labels = await new PimCatalogueLimitTargetLabels(families, skus).labelsOf([
      { scopeType: "category", scopeId: "cat_1" },
      { scopeType: "product", scopeId: "prd_1" },
      { scopeType: "variant", scopeId: "var_1" },
      { scopeType: "global", scopeId: null },
    ]);

    expect(Object.fromEntries(labels)).toEqual({
      cat_1: "Viennoiserie",
      prd_1: "ENT-001",
      var_1: "ENT-001-6P",
    });
    expect(families.asked).toEqual([["cat_1"]]);
    expect(skus.askedProducts).toEqual([["prd_1"]]);
    expect(skus.askedVariants).toEqual([["var_1"]]);
  });

  it("omet une cible disparue plutôt que de lui inventer un nom", async () => {
    const labels = await new PimCatalogueLimitTargetLabels(
      new NamedFamilies(),
      new KnownSkus(),
    ).labelsOf([{ scopeType: "product", scopeId: "prd_gone" }]);

    expect(labels.size).toBe(0);
  });
});
