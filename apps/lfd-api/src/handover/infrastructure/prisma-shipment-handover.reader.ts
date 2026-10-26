import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { ShipmentHandoverReader } from "../channels/commerce/shipment-handover.reader.js";

/** `order_handover`, tous rangs confondus. */
@Injectable()
export class PrismaShipmentHandoverReader extends ShipmentHandoverReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async handedOverRanks(orderId: string): Promise<readonly number[]> {
    const rows = await this.prisma.orderHandover.findMany({
      where: { orderId },
      select: { rank: true },
      orderBy: { rank: "asc" },
    });
    return rows.map((row) => row.rank);
  }
}
