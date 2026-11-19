import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import type { Product } from "../domain/entities/product.js";
import { UndeclaredAllergensWriteError } from "../domain/errors/product-invariant-errors.js";
import { VariantAllergensRepository } from "../domain/ports/variant-allergens.repository.js";

@Injectable()
export class PrismaVariantAllergensRepository extends VariantAllergensRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  /**
   * `upsert` et non `create` : redéclarer remplace, il n'existe pas deux
   * déclarations pour une déclinaison — la clé primaire partagée l'interdit de
   * toute façon.
   *
   * ⚠️ L'`upsert` est **nu** : deux personnes qui éditent la même section
   * s'écrasent toujours, et la séparation des tables n'y change rien. Ce qu'elle
   * change est qu'une écriture de nutrition ne peut plus détruire celle-ci.
   */
  async save(product: Product, variantId: string): Promise<void> {
    const declaration = product.ownAllergenDeclaration(variantId);
    if (declaration === null) {
      throw new UndeclaredAllergensWriteError(product.id, variantId);
    }
    const data = {
      allergens: [...declaration.allergens],
      mayContain: [...declaration.mayContain],
    };
    await this.prisma.variantAllergens.upsert({
      where: { variantId },
      create: { variantId, ...data },
      update: data,
    });
  }
}
