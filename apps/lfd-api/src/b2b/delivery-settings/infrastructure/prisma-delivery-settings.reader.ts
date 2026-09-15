import { DEFAULT_DELIVERY_SETTINGS, type DeliverySettingsView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { DeliverySettingsReader } from "../domain/ports/delivery-settings.reader.js";
import { DELIVERY_SETTINGS_KEY } from "./delivery-settings.key.js";

/**
 * Adaptateur Prisma de la lecture du réglage.
 *
 * **Ligne absente = ouverte aux deux**, sans semis : c'est l'existant, et une
 * base neuve ou remise à zéro doit se comporter comme la production d'avant.
 */
@Injectable()
export class PrismaDeliverySettingsReader extends DeliverySettingsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async current(): Promise<DeliverySettingsView> {
    const row = await this.prisma.deliverySettings.findUnique({
      where: { key: DELIVERY_SETTINGS_KEY },
      select: { openToB2b: true, openToB2c: true, updatedAt: true, updatedByName: true },
    });
    if (row === null) {
      return DEFAULT_DELIVERY_SETTINGS;
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
