import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { DeliverySettings } from "../domain/delivery-settings.js";
import { DeliverySettingsRepository } from "../domain/ports/delivery-settings.repository.js";
import { DELIVERY_SETTINGS_KEY } from "./delivery-settings.key.js";

/** Adaptateur Prisma de l'écriture du réglage : un `upsert` sur la clé naturelle. */
@Injectable()
export class PrismaDeliverySettingsRepository extends DeliverySettingsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async put(settings: DeliverySettings): Promise<void> {
    const row = {
      openToB2b: settings.openToB2b,
      openToB2c: settings.openToB2c,
      updatedAt: settings.at,
      updatedBySub: settings.author.sub,
      updatedByName: settings.author.name,
      updatedByRole: settings.author.role,
    };
    await this.prisma.deliverySettings.upsert({
      where: { key: DELIVERY_SETTINGS_KEY },
      create: { key: DELIVERY_SETTINGS_KEY, ...row },
      update: row,
    });
  }
}
