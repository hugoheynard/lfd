import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ShelfChanges } from "../../shared/shelf-changes/domain/ports/shelf-changes.js";
import { ALL_SHELVES } from "../../shared/shelf-changes/domain/shelf-change-scope.js";
import {
  CatalogReservations,
  type CatalogReservation,
} from "../domain/ports/catalog-reservations.js";

/** Les réservations d'articles, une ligne par couple article × société. */
@Injectable()
export class PrismaCatalogReservations extends CatalogReservations {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shelves: ShelfChanges,
  ) {
    super();
  }

  async reserve(reservation: CatalogReservation): Promise<boolean> {
    // La clé primaire tient le doublon : deux réservations simultanées ne
    // créent qu'une ligne, et la seconde rend `false` sans erreur.
    const { count } = await this.prisma.catalogItemReservation.createMany({
      data: [{ ...reservation }],
      skipDuplicates: true,
    });
    // Une réservation retire l'article à tous sauf une société, public compris.
    if (count > 0) {
      this.shelves.changed(ALL_SHELVES);
    }
    return count > 0;
  }

  async release(sku: string, companyId: string): Promise<boolean> {
    const { count } = await this.prisma.catalogItemReservation.deleteMany({
      where: { sku, companyId },
    });
    if (count > 0) {
      this.shelves.changed(ALL_SHELVES);
    }
    return count > 0;
  }
}
