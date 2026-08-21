import { Test } from "@nestjs/testing";

import { TvaRateRepository } from "../../../../commerce/domain/ports/tva-rate.repository.js";
import { CatalogueReader } from "../../domain/ports/catalogue-reader.js";
import { CategoryRepository } from "../../../category/domain/ports/category.repository.js";
import { ProductRepository } from "../../../product/domain/ports/product.repository.js";
import { PrismaCatalogueReader } from "../prisma-catalogue-reader.js";

interface CategoryLike {
  emporterTvaId: string | null;
  surPlaceTvaId: string | null;
}

async function build(
  category: CategoryLike | null,
  regimes: Record<string, number>,
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
        provide: TvaRateRepository,
        useValue: {
          findById: (id: string) =>
            Promise.resolve(id in regimes ? { percent: regimes[id] } : null),
        },
      },
    ],
  }).compile();
  return moduleRef.get(CatalogueReader);
}

describe("PrismaCatalogueReader.tvaPercents", () => {
  it("résout le TAUX par contexte depuis les taux de la catégorie", async () => {
    const reader = await build({ emporterTvaId: "r1", surPlaceTvaId: "r2" }, { r1: 5.5, r2: 10 });

    const rates = await reader.tvaPercents("cat_vien");

    expect(rates.emporter).toBe(5.5);
    expect(rates.surPlace).toBe(10);
  });

  it("rend null pour un contexte non réglé sur la catégorie", async () => {
    const reader = await build({ emporterTvaId: "r1", surPlaceTvaId: null }, { r1: 5.5 });

    const rates = await reader.tvaPercents("cat_vien");

    expect(rates.emporter).toBe(5.5);
    expect(rates.surPlace).toBeNull();
  });

  it("rend null/null pour une catégorie introuvable", async () => {
    const reader = await build(null, {});
    expect(await reader.tvaPercents("nope")).toEqual({
      emporter: null,
      surPlace: null,
    });
  });
});
