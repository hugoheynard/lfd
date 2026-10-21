import { DEFAULT_ORDER_CUTOFF_SETTINGS, type OrderCutoffSettingsView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderCutoffSettingsReader } from "../domain/order-cutoff-settings.reader.js";
import { ORDER_CUTOFF_SETTINGS_KEY } from "./order-cutoff-settings.key.js";

/**
 * Adaptateur Prisma de la lecture du jour même. **Ligne absente = jour même
 * fermé** : la migration n'en pose aucune. `enabled` (l'interrupteur retiré le
 * 2026-10-21) n'est plus lu.
 */
@Injectable()
export class PrismaOrderCutoffSettingsReader extends OrderCutoffSettingsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async current(): Promise<OrderCutoffSettingsView> {
    const row = await this.prisma.orderCutoffSettings.findUnique({
      where: { key: ORDER_CUTOFF_SETTINGS_KEY },
      select: {
        sameDayAllowed: true,
        resupplySubjectToCutoff: true,
        updatedAt: true,
        updatedByName: true,
      },
    });
    if (row === null) {
      return DEFAULT_ORDER_CUTOFF_SETTINGS;
    }
    return {
      sameDayAllowed: row.sameDayAllowed,
      resupplySubjectToCutoff: row.resupplySubjectToCutoff,
      updatedAt: row.updatedAt.toISOString(),
      // Un agent que l'annuaire ne connaissait pas a été figé sans nom : on ne l'invente pas.
      updatedBy: row.updatedByName === "" ? null : row.updatedByName,
    };
  }
}
