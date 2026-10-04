import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { PackingShadowReader, type ShadowDay } from "../domain/ports/packing-shadow.reader.js";

/** L'adaptateur Prisma de la lecture de l'ombre — une journée, ses commandes et ses réserves. */
@Injectable()
export class PrismaPackingShadowReader extends PackingShadowReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async dayOf(serviceDay: string): Promise<ShadowDay> {
    const [orders, stocks] = await Promise.all([
      this.prisma.packingOrder.findMany({
        where: { serviceDay },
        select: {
          orderId: true,
          reference: true,
          dueAt: true,
          lines: { select: { sku: true, quantity: true } },
        },
      }),
      this.prisma.packingStock.findMany({
        where: { serviceDay },
        select: { sku: true, received: true, returned: true, packed: true },
      }),
    ]);
    return { orders, stocks };
  }
}
