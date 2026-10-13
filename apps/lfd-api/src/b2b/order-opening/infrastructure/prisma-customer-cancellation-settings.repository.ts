import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { CustomerCancellationSettings } from "../domain/customer-cancellation-settings.js";
import { CustomerCancellationSettingsRepository } from "../domain/ports/customer-cancellation-settings.repository.js";
import { ORDER_OPENING_KEY } from "./order-opening.key.js";

/** Adaptateur Prisma de l'écriture du réglage : un `upsert` sur la clé naturelle `orders`. */
@Injectable()
export class PrismaCustomerCancellationSettingsRepository extends CustomerCancellationSettingsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async put(settings: CustomerCancellationSettings): Promise<void> {
    const row = {
      openToB2c: settings.openToB2c,
      hoursBefore: settings.hoursBefore,
      updatedAt: settings.at,
      updatedByStaffId: settings.author.staffUserId,
      updatedByName: settings.author.name,
      updatedByRole: settings.author.role,
    };
    await this.prisma.customerCancellationSettings.upsert({
      where: { key: ORDER_OPENING_KEY },
      create: { key: ORDER_OPENING_KEY, ...row },
      update: row,
    });
  }
}
