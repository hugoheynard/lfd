import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import type { DeliveryAuthor } from "../domain/entities/departure-choice.js";
import { RoutingSettingsRepository } from "../domain/ports/routing-settings.repository.js";
import type { RoutingSettings } from "../domain/value-objects/routing-settings.js";
import { ROUTING_SETTINGS_KEY } from "./routing-settings.key.js";

/** Adaptateur Prisma de l'écriture des réglages du calcul : un `upsert` sur la clé naturelle. */
@Injectable()
export class PrismaRoutingSettingsRepository extends RoutingSettingsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async put(settings: RoutingSettings, at: Date, author: DeliveryAuthor): Promise<void> {
    const row = {
      ...settings.values(),
      updatedAt: at,
      updatedByStaffId: author.staffUserId,
      updatedByName: author.name,
      updatedByRole: author.role,
    };
    await this.prisma.deliveryRoutingSettings.upsert({
      where: { key: ROUTING_SETTINGS_KEY },
      create: { key: ROUTING_SETTINGS_KEY, ...row },
      update: row,
    });
  }
}
