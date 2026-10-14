import { DEFAULT_ORDER_CUTOFF_SETTINGS, type OrderCutoffSettingsView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderCutoffSettingsReader } from "../domain/order-cutoff-settings.reader.js";
import { ORDER_CUTOFF_SETTINGS_KEY } from "./order-cutoff-settings.key.js";

/**
 * Adaptateur Prisma de la lecture de l'interrupteur. **Ligne absente =
 * activée** : la migration n'en pose aucune, et une base remise à zéro (e2e)
 * applique la règle comme avant le lot O3.
 */
@Injectable()
export class PrismaOrderCutoffSettingsReader extends OrderCutoffSettingsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async current(): Promise<OrderCutoffSettingsView> {
    const row = await this.prisma.orderCutoffSettings.findUnique({
      where: { key: ORDER_CUTOFF_SETTINGS_KEY },
      select: { enabled: true, sameDayAllowed: true, updatedAt: true, updatedByName: true },
    });
    if (row === null) {
      return DEFAULT_ORDER_CUTOFF_SETTINGS;
    }
    return {
      enabled: row.enabled,
      sameDayAllowed: row.sameDayAllowed,
      updatedAt: row.updatedAt.toISOString(),
      // Un agent que l'annuaire ne connaissait pas a été figé sans nom : on ne l'invente pas.
      updatedBy: row.updatedByName === "" ? null : row.updatedByName,
    };
  }
}
