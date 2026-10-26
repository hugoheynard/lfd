import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { ShipmentHandoverReader } from "../channels/commerce/shipment-handover.reader.js";

/** `order_handover`, tous rangs confondus — une ligne suffit à répondre. */
@Injectable()
export class PrismaShipmentHandoverReader extends ShipmentHandoverReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async anyHandedOver(orderId: string): Promise<boolean> {
    const row = await this.prisma.orderHandover.findFirst({
      where: { orderId },
      select: { rank: true },
    });
    return row !== null;
  }
}
