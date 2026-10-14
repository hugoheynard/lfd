import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { OrderCutoffSettings } from "../domain/order-cutoff-settings.js";
import { OrderCutoffSettingsRepository } from "../domain/order-cutoff-settings.repository.js";
import { ORDER_CUTOFF_SETTINGS_KEY } from "./order-cutoff-settings.key.js";

/** Adaptateur Prisma de l'écriture de l'interrupteur : un `upsert` sur la clé naturelle `orders`. */
@Injectable()
export class PrismaOrderCutoffSettingsRepository extends OrderCutoffSettingsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async put(settings: OrderCutoffSettings): Promise<void> {
    const row = {
      enabled: settings.enabled,
      sameDayAllowed: settings.sameDayAllowed,
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
