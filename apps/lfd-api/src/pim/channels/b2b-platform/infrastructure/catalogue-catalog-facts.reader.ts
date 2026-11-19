import { Injectable } from "@nestjs/common";

import { AllCategoriesReader } from "../../../catalogue/category/domain/ports/all-categories.reader.js";
import { CategorySnapshotsReader } from "../../../catalogue/category/domain/ports/category-snapshots.reader.js";
import { AllProductsReader } from "../../../catalogue/product/domain/ports/all-products.reader.js";
import type { ProductRecord } from "../../../catalogue/product/domain/ports/product.repository.js";
import { ProductRecordsReader } from "../../../catalogue/product/domain/ports/product-records.reader.js";
import {
  CatalogFactsReader,
  type CatalogFamilyRecord,
} from "../domain/ports/catalog-facts.reader.js";

/**
 * L'adaptateur ne lit aucune table : il compose les lectures que la fiche et
 * la famille publient. Elles suivent la transaction ambiante — appelé par
 * l'émetteur, il lit ce que le geste vient d'écrire.
 */
@Injectable()
export class CatalogueCatalogFactsReader extends CatalogFactsReader {
  constructor(
    private readonly productRecords: ProductRecordsReader,
    private readonly categorySnapshots: CategorySnapshotsReader,
    private readonly allProducts: AllProductsReader,
    private readonly allCategories: AllCategoriesReader,
  ) {
    super();
  }

  products(ids: readonly string[]): Promise<ProductRecord[]> {
    return this.productRecords.byIds(ids);
  }

  async families(ids: readonly string[]): Promise<CatalogFamilyRecord[]> {
    return (await this.categorySnapshots.byIds(ids)).map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      parentId: category.parentId,
      position: category.position,
      isArchived: category.isArchived,
      audience: category.audience,
      vatByContext: category.vatByContext,
    }));
  }

  async productIdsOfFamilies(familyIds: readonly string[]): Promise<string[]> {
    const wanted = new Set(familyIds);
    return (await this.allProducts.all())
      .filter((product) => wanted.has(product.categoryId))
      .map((product) => product.id);
  }

  async allProductIds(): Promise<string[]> {
    return (await this.allProducts.all()).map((product) => product.id);
  }

  async allFamilyIds(): Promise<string[]> {
    return (await this.allCategories.all()).map((category) => category.id);
  }
}
