import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { PointOfSaleOfferReader } from "../domain/ports/point-of-sale-offer.reader.js";

@Injectable()
export class PrismaPointOfSaleOfferReader extends PointOfSaleOfferReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  /**
   * Une seule requête, et seulement sur les identifiants demandés : une matrice
   * en cite une poignée, pas le référentiel entier.
   */
  async offersOf(ids: readonly string[]): Promise<ReadonlyMap<string, ReadonlySet<string>>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.pointOfSale.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, contexts: { select: { contextKey: true } } },
    });
    return new Map(
      rows.map((row) => [row.id, new Set(row.contexts.map((offer) => offer.contextKey))]),
    );
  }
}
