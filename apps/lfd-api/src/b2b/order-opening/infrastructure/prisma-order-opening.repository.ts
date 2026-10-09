import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { OrderOpening } from "../domain/order-opening.js";
import { OrderOpeningRepository } from "../domain/ports/order-opening.repository.js";
import { ORDER_OPENING_KEY } from "./order-opening.key.js";

/** Adaptateur Prisma de l'écriture du réglage : un `upsert` sur la clé naturelle. */
@Injectable()
export class PrismaOrderOpeningRepository extends OrderOpeningRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async put(settings: OrderOpening): Promise<void> {
    const row = {
      ordersOpenToB2b: settings.ordersOpenToB2b,
      ordersOpenToB2c: settings.ordersOpenToB2c,
      updatedAt: settings.at,
      updatedByStaffId: settings.author.staffUserId,
      updatedByName: settings.author.name,
      updatedByRole: settings.author.role,
    };
    await this.prisma.orderOpening.upsert({
      where: { key: ORDER_OPENING_KEY },
      create: { key: ORDER_OPENING_KEY, ...row },
      update: row,
    });
  }
}
