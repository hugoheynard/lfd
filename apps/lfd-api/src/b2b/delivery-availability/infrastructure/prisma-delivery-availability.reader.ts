import { DEFAULT_DELIVERY_AVAILABILITY, type DeliveryAvailabilityView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { DeliveryAvailabilityReader } from "../domain/ports/delivery-availability.reader.js";
import { DELIVERY_AVAILABILITY_KEY } from "./delivery-availability.key.js";

/**
 * Adaptateur Prisma de la lecture du réglage.
 *
 * **Ligne absente = ouverte aux deux**, sans semis : c'est l'existant, et une
 * base neuve ou remise à zéro doit se comporter comme la production d'avant.
 */
@Injectable()
export class PrismaDeliveryAvailabilityReader extends DeliveryAvailabilityReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async current(): Promise<DeliveryAvailabilityView> {
    const row = await this.prisma.deliveryAvailability.findUnique({
      where: { key: DELIVERY_AVAILABILITY_KEY },
      select: { openToB2b: true, openToB2c: true, updatedAt: true, updatedByName: true },
    });
    if (row === null) {
      return DEFAULT_DELIVERY_AVAILABILITY;
    }
    return {
      openToB2b: row.openToB2b,
      openToB2c: row.openToB2c,
      updatedAt: row.updatedAt.toISOString(),
      // Un agent que l'annuaire ne connaissait pas a été figé sans nom : on ne
      // l'invente pas, et une chaîne vide n'est pas un nom à afficher.
      updatedBy: row.updatedByName === "" ? null : row.updatedByName,
    };
  }
}
