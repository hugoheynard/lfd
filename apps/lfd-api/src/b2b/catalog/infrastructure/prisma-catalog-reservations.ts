import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CatalogReservations,
  type CatalogReservation,
} from "../domain/ports/catalog-reservations.js";

/** Les réservations d'articles, une ligne par couple article × société. */
@Injectable()
export class PrismaCatalogReservations extends CatalogReservations {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async reserve(reservation: CatalogReservation): Promise<boolean> {
    // La clé primaire tient le doublon : deux réservations simultanées ne
    // créent qu'une ligne, et la seconde rend `false` sans erreur.
    const { count } = await this.prisma.catalogItemReservation.createMany({
      data: [{ ...reservation }],
      skipDuplicates: true,
    });
    return count > 0;
  }

  async release(sku: string, companyId: string): Promise<boolean> {
    const { count } = await this.prisma.catalogItemReservation.deleteMany({
      where: { sku, companyId },
    });
    return count > 0;
  }
}
