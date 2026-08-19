import { Test } from "@nestjs/testing";

import { TvaRegimeRepository } from "../../../commerce/domain/ports/tva-regime.repository.js";
import { CatalogueReader } from "../../domain/ports/catalogue-reader.js";
import { CategoryRepository } from "../../domain/ports/category.repository.js";
import { ProductRepository } from "../../domain/ports/product.repository.js";
import { PrismaCatalogueReader } from "../prisma-catalogue-reader.js";

interface CategoryLike {
  emporterTvaId: string | null;
  surPlaceTvaId: string | null;
}

async function build(
  category: CategoryLike | null,
  regimes: Record<string, string>,
): Promise<CatalogueReader> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      { provide: CatalogueReader, useClass: PrismaCatalogueReader },
      {
        provide: ProductRepository,
        useValue: { listAll: () => Promise.resolve([]) },
      },
      {
        provide: CategoryRepository,
        useValue: { findById: () => Promise.resolve(category) },
      },
      {
        provide: TvaRegimeRepository,
        useValue: {
          findById: (id: string) => Promise.resolve(id in regimes ? { tag: regimes[id] } : null),
        },
      },
    ],
  }).compile();
  return moduleRef.get(CatalogueReader);
}

describe("PrismaCatalogueReader.tvaTags", () => {
  it("résout le tag de collection par contexte depuis les régimes de la catégorie", async () => {
    const reader = await build(
      { emporterTvaId: "r1", surPlaceTvaId: "r2" },
      { r1: "tva-5-5", r2: "tva-10" },
    );

    const tags = await reader.tvaTags("cat_vien");

    expect(tags.emporter).toBe("tva-5-5");
    expect(tags.surPlace).toBe("tva-10");
  });

  it("rend null pour un contexte non réglé sur la catégorie", async () => {
    const reader = await build({ emporterTvaId: "r1", surPlaceTvaId: null }, { r1: "tva-5-5" });

    const tags = await reader.tvaTags("cat_vien");

    expect(tags.emporter).toBe("tva-5-5");
    expect(tags.surPlace).toBeNull();
  });

  it("rend null/null pour une catégorie introuvable", async () => {
    const reader = await build(null, {});
    expect(await reader.tvaTags("nope")).toEqual({
      emporter: null,
      surPlace: null,
    });
  });
});
