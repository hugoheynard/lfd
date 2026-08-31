import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import {
  ReadinessRepository,
  type ProductReadiness,
} from "../domain/ports/readiness.repository.js";

/**
 * La déclaration en base, et la date qui la périme.
 *
 * ## Les tables qui datent une fiche
 *
 * Quatre, et la liste est ICI parce qu'elle n'a pas d'autre endroit où vivre :
 * elle décrit le SCHÉMA, et c'est l'adaptateur qui connaît le schéma. Une
 * table qu'on ajouterait à la fiche sans l'ajouter ici ne périmerait rien —
 * c'est le seul défaut possible de ce modèle, et il est tenu par un test qui
 * modifie chaque table et vérifie que la date bouge.
 */
@Injectable()
export class PrismaReadinessRepository extends ReadinessRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async read(productId: string): Promise<ProductReadiness | null> {
    const row = await this.prisma.productReadiness.findUnique({ where: { productId } });
    return row === null ? null : { readyAt: row.readyAt, readyBy: row.readyBy };
  }

  async contentUpdatedAt(productId: string): Promise<Date | null> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        updatedAt: true,
        variants: { select: { updatedAt: true } },
        editorial: { select: { updatedAt: true } },
        media: { select: { updatedAt: true } },
      },
    });
    if (product === null) {
      return null;
    }
    const dates = [
      product.updatedAt,
      ...product.variants.map((variant) => variant.updatedAt),
      ...product.media.map((slot) => slot.updatedAt),
      ...(product.editorial === null ? [] : [product.editorial.updatedAt]),
    ];
    // `reduce` et pas `Math.max` : ce dernier passerait par des nombres, et
    // rendrait un `number` là où tout le reste manipule des `Date`.
    return dates.reduce((latest, date) => (date > latest ? date : latest));
  }

  async declare(productId: string, readiness: ProductReadiness): Promise<void> {
    await this.prisma.productReadiness.upsert({
      where: { productId },
      create: { productId, readyAt: readiness.readyAt, readyBy: readiness.readyBy },
      update: { readyAt: readiness.readyAt, readyBy: readiness.readyBy },
    });
  }
}
