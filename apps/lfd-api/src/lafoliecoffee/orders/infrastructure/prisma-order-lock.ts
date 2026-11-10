import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderLock } from "../domain/ports/order-lock.js";

/** Le même verrou que `lockProgressOf` : la ligne `orders`, par le client routé. */
@Injectable()
export class PrismaOrderLock extends OrderLock {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lock(orderId: string): Promise<void> {
    await this.prisma.$queryRaw`
      SELECT "id" FROM "public"."orders" WHERE "id" = ${orderId} FOR UPDATE`;
  }
}
