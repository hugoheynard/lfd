import { Injectable } from "@nestjs/common";

import { CategoryRepository } from "../../category/domain/ports/category.repository.js";
import {
  ProductRepository,
  type ProductRecord,
} from "../../product/domain/ports/product.repository.js";
import {
  CatalogFactsReader,
  type CatalogFamilyRecord,
} from "../domain/ports/catalog-facts.reader.js";

/**
 * L'adaptateur, **par les dépôts** plutôt qu'en Prisma direct : la fiche se
 * relit par le même mapper que celui qui l'écrit, déclinaisons alignées
 * résolues comprises (`snapshot()`). Une seconde lecture SQL de la fiche
 * finirait par diverger de la première.
 *
 * Les dépôts suivent la transaction ambiante : appelé par l'émetteur, il lit
 * ce que le geste vient d'écrire.
 */
@Injectable()
export class RepositoryCatalogFactsReader extends CatalogFactsReader {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly categoryRepository: CategoryRepository,
  ) {
    super();
  }

  async products(ids: readonly string[]): Promise<ProductRecord[]> {
    const found: ProductRecord[] = [];
    for (const id of ids) {
      const product = await this.productRepository.findById(id);
      if (product !== null) {
        found.push(product.snapshot());
      }
    }
    return found;
  }

  async families(ids: readonly string[]): Promise<CatalogFamilyRecord[]> {
    const found: CatalogFamilyRecord[] = [];
    for (const id of ids) {
      const category = await this.categoryRepository.findById(id);
      if (category !== null) {
        found.push({
          id: category.id,
          name: category.name,
          slug: category.slug,
          parentId: category.parentId,
          position: category.position,
          isArchived: category.isArchived,
          audience: category.audience,
          vatByContext: category.vatByContext,
        });
      }
    }
    return found;
  }

  async productIdsOfFamilies(familyIds: readonly string[]): Promise<string[]> {
    const wanted = new Set(familyIds);
    return (await this.productRepository.listAll())
      .filter((product) => wanted.has(product.categoryId))
      .map((product) => product.id);
  }

  async allProductIds(): Promise<string[]> {
    return (await this.productRepository.listAll()).map((product) => product.id);
  }

  async allFamilyIds(): Promise<string[]> {
    return (await this.categoryRepository.listAll()).map((category) => category.id);
  }
}
