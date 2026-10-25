import {
  DEFAULT_CUSTOMER_CANCELLATION_SETTINGS,
  type CustomerCancellationSettingsView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CustomerCancellationSettingsReader } from "../domain/ports/customer-cancellation-settings.reader.js";
import { ORDER_OPENING_KEY } from "./order-opening.key.js";

/**
 * Adaptateur Prisma de la lecture du réglage d'annulation par le client.
 *
 * **Ligne absente = délai actif** (24 h) : le défaut voulu par Hugo le
 * 2026-10-13 — une base remise à zéro (e2e) applique le délai.
 */
@Injectable()
export class PrismaCustomerCancellationSettingsReader extends CustomerCancellationSettingsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async current(): Promise<CustomerCancellationSettingsView> {
    const row = await this.prisma.customerCancellationSettings.findUnique({
      where: { key: ORDER_OPENING_KEY },
      select: {
        delayEnabled: true,
        hoursBefore: true,
        b2cCancellableUntil: true,
        updatedAt: true,
        updatedByName: true,
      },
    });
    if (row === null) {
      return DEFAULT_CUSTOMER_CANCELLATION_SETTINGS;
    }
    return {
      delayEnabled: row.delayEnabled,
      hoursBefore: row.hoursBefore,
      b2cCancellableUntil: row.b2cCancellableUntil,
      updatedAt: row.updatedAt === null ? null : row.updatedAt.toISOString(),
      // Un agent que l'annuaire ne connaissait pas a été figé sans nom : on ne
      // l'invente pas ; la ligne posée par la migration n'a pas d'auteur.
      updatedBy: row.updatedByName === null || row.updatedByName === "" ? null : row.updatedByName,
    };
  }
}
