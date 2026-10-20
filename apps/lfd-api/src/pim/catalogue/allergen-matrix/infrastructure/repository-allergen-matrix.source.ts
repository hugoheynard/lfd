import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { CategoryRepository } from "../../category/domain/ports/category.repository.js";
import {
  ProductRepository,
  type ProductRecord,
} from "../../product/domain/ports/product.repository.js";
import {
  AllergenMatrixSource,
  type MatrixFamilyRecord,
} from "../domain/ports/allergen-matrix.source.js";

/**
 * L'adaptateur, **par les dépôts** plutôt qu'en Prisma direct pour les fiches — même choix que
 * `RepositoryCatalogFactsReader` : la fiche se relit par le mapper qui l'écrit,
 * et la résolution de l'alignement reste celle de l'agrégat. Une seconde
 * lecture SQL des déclinaisons referait l'héritage à côté du domaine.
 */
@Injectable()
export class RepositoryAllergenMatrixSource extends AllergenMatrixSource {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly prisma: PimPrismaService,
  ) {
    super();
  }

  async products(): Promise<readonly ProductRecord[]> {
    const all = await this.productRepository.listAll();
    return all.filter((product) => product.status !== "archived").map((p) => p.snapshot());
  }

  async families(): Promise<readonly MatrixFamilyRecord[]> {
    const all = await this.categoryRepository.listAll();
    return all.map((category) => ({
      id: category.id,
      name: category.name,
      parentId: category.parentId,
      position: category.position,
      isArchived: category.isArchived,
    }));
  }

  /**
   * Trois agrégats `max` et non une relecture des lignes : la date est un
   * maximum, la base le calcule. Pas de déclinaison archivée à écarter — une
   * déclinaison n'en a pas (plan §0).
   */
  async lastModifiedAt(productIds: readonly string[]): Promise<Date | null> {
    if (productIds.length === 0) {
      return null;
    }
    const ids = [...productIds];
    const [products, variants, sheets] = await Promise.all([
      this.prisma.product.aggregate({ where: { id: { in: ids } }, _max: { updatedAt: true } }),
      this.prisma.productVariant.aggregate({
        where: { productId: { in: ids } },
        _max: { updatedAt: true },
      }),
      this.prisma.variantAllergens.aggregate({
        where: { variant: { productId: { in: ids } } },
        _max: { updatedAt: true },
      }),
    ]);
    const dates = [products._max.updatedAt, variants._max.updatedAt, sheets._max.updatedAt].filter(
      (date): date is Date => date !== null,
    );
    return dates.reduce<Date | null>(
      (latest, date) => (latest === null || date > latest ? date : latest),
      null,
    );
  }
}
