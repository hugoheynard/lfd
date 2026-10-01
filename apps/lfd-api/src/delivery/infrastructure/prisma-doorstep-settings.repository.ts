import type { DoorstepRule } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import type { DeliveryAuthor } from "../domain/entities/departure-choice.js";
import { DoorstepSettingsRepository } from "../domain/ports/doorstep-settings.repository.js";
import { DOORSTEP_SETTINGS_KEY } from "./doorstep-settings.key.js";

/** Adaptateur Prisma de l'écriture du réglage global à la porte : un `upsert` sur la clé naturelle. */
@Injectable()
export class PrismaDoorstepSettingsRepository extends DoorstepSettingsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async put(rule: DoorstepRule, at: Date, author: DeliveryAuthor): Promise<void> {
    const row = {
      rule,
      updatedAt: at,
      updatedByStaffId: author.staffUserId,
      updatedByName: author.name,
      updatedByRole: author.role,
    };
    await this.prisma.deliveryDoorstepSettings.upsert({
      where: { key: DOORSTEP_SETTINGS_KEY },
      create: { key: DOORSTEP_SETTINGS_KEY, ...row },
      update: row,
    });
  }
}
