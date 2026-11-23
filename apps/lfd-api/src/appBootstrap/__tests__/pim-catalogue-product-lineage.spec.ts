import { localizedText } from "../../pim/catalogue/shared/domain/value-objects/localized-text.js";
import {
  CategoryChainReader,
  type CategoryChainLink,
} from "../../pim/catalogue/category/domain/ports/category-chain.reader.js";
import {
  ProductPlacementReader,
  type ProductPlacement,
} from "../../pim/catalogue/product/domain/ports/product-placement.reader.js";
import { PimCatalogueProductLineage } from "../pim-catalogue-product-lineage.js";

/** Entremets sous Gâteaux ; le Fraisier rangé dans Entremets. */
const PARENTS: Readonly<Record<string, string | null>> = { entremets: "gateaux", gateaux: null };

class TreeChains extends CategoryChainReader {
  chainOf(categoryId: string): Promise<readonly CategoryChainLink[]> {
    const chain: CategoryChainLink[] = [];
    let current: string | null | undefined = categoryId;
    while (current !== null && current !== undefined && current in PARENTS) {
      chain.push({ id: current, name: localizedText("name", { fr: current }) });
      current = PARENTS[current];
    }
    return Promise.resolve(chain);
  }
}

class ShelvedProducts extends ProductPlacementReader {
  placementOf(productId: string): Promise<ProductPlacement | null> {
    return Promise.resolve(
      productId === "fraisier"
        ? { productId, categoryId: "entremets", vatByContext: {}, variantSkus: [] }
        : null,
    );
  }
}

describe("PimCatalogueProductLineage — où se rangent une fiche et une famille", () => {
  const lineage = new PimCatalogueProductLineage(new ShelvedProducts(), new TreeChains());

  it("rend les familles d'une fiche, la plus proche d'abord", async () => {
    expect(await lineage.lineageOf("fraisier")).toEqual(["entremets", "gateaux"]);
  });

  it("rend null pour une fiche inconnue", async () => {
    expect(await lineage.lineageOf("inconnu")).toBeNull();
  });

  it("dit si une famille existe", async () => {
    expect(await lineage.familyExists("gateaux")).toBe(true);
    expect(await lineage.familyExists("inconnue")).toBe(false);
  });
});
