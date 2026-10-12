import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { OrderWithdrawalsReader } from "../domain/ports/order-withdrawals.reader.js";
import type { ServiceDay } from "../domain/value-objects/service-day.value-object.js";

/** Les retraits d'une journée, par l'index `service_day`. */
@Injectable()
export class PrismaOrderWithdrawalsReader extends OrderWithdrawalsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async withdrawnOn(day: ServiceDay): Promise<ReadonlySet<string>> {
    const rows = await this.prisma.orderWithdrawal.findMany({
      where: { serviceDay: day.value },
      select: { orderId: true },
    });
    return new Set(rows.map((row) => row.orderId));
  }
}
