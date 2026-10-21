import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { OrderCutoffSettings } from "../domain/order-cutoff-settings.js";
import { OrderCutoffSettingsRepository } from "../domain/order-cutoff-settings.repository.js";
import { ORDER_CUTOFF_SETTINGS_KEY } from "./order-cutoff-settings.key.js";

/** Adaptateur Prisma de l'écriture du jour même : un `upsert` sur la clé naturelle `orders`. */
@Injectable()
export class PrismaOrderCutoffSettingsRepository extends OrderCutoffSettingsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async put(settings: OrderCutoffSettings): Promise<void> {
    // `enabled` n'est plus écrit (2026-10-21) : la colonne garde son défaut.
    const row = {
      sameDayAllowed: settings.sameDayAllowed,
      resupplySubjectToCutoff: settings.resupplySubjectToCutoff,
      updatedAt: settings.at,
      updatedByStaffId: settings.author.staffUserId,
      updatedByName: settings.author.name,
      updatedByRole: settings.author.role,
    };
    await this.prisma.orderCutoffSettings.upsert({
      where: { key: ORDER_CUTOFF_SETTINGS_KEY },
      create: { key: ORDER_CUTOFF_SETTINGS_KEY, ...row },
      update: row,
    });
  }
}
