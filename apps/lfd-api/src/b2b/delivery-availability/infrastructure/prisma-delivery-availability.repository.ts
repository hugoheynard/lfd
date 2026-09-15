import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { DeliveryAvailability } from "../domain/delivery-availability.js";
import { DeliveryAvailabilityRepository } from "../domain/ports/delivery-availability.repository.js";
import { DELIVERY_AVAILABILITY_KEY } from "./delivery-availability.key.js";

/** Adaptateur Prisma de l'écriture du réglage : un `upsert` sur la clé naturelle. */
@Injectable()
export class PrismaDeliveryAvailabilityRepository extends DeliveryAvailabilityRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async put(settings: DeliveryAvailability): Promise<void> {
    const row = {
      openToB2b: settings.openToB2b,
      openToB2c: settings.openToB2c,
      updatedAt: settings.at,
      updatedBySub: settings.author.sub,
      updatedByName: settings.author.name,
      updatedByRole: settings.author.role,
    };
    await this.prisma.deliveryAvailability.upsert({
      where: { key: DELIVERY_AVAILABILITY_KEY },
      create: { key: DELIVERY_AVAILABILITY_KEY, ...row },
      update: row,
    });
  }
}
