import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ShelfChanges } from "../../shared/shelf-changes/domain/ports/shelf-changes.js";
import { ALL_SHELVES } from "../../shared/shelf-changes/domain/shelf-change-scope.js";
import type { OrderCutoffSettings } from "../domain/order-cutoff-settings.js";
import { OrderCutoffSettingsRepository } from "../domain/order-cutoff-settings.repository.js";
import { ORDER_CUTOFF_SETTINGS_KEY } from "./order-cutoff-settings.key.js";

/** Adaptateur Prisma de l'écriture du jour même : un `upsert` sur la clé naturelle `orders`. */
@Injectable()
export class PrismaOrderCutoffSettingsRepository extends OrderCutoffSettingsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shelves: ShelfChanges,
  ) {
    super();
  }

  async put(settings: OrderCutoffSettings): Promise<void> {
    // `enabled` n'est plus écrit (2026-10-21) : la colonne garde son défaut.
    const row = {
      sameDayAllowed: settings.sameDayAllowed,
      resupplyCutoffTime: settings.resupplyCutoffTime,
      pickupReminderDelayMinutes: settings.pickupReminderDelayMinutes,
      delayWarningDelayMinutes: settings.delayWarningDelayMinutes,
      lateToleranceMinutes: settings.lateToleranceMinutes,
      sameDayPublicAllowed: settings.sameDayPublicAllowed,
      sameDayProAllowed: settings.sameDayProAllowed,
      sameDayProOnline: settings.sameDayProOnline,
      sameDayProWithoutCredit: settings.sameDayProWithoutCredit,
      shelfHoldMinutes: settings.shelfHoldMinutes,
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
    this.shelves.changed(ALL_SHELVES);
  }
}
