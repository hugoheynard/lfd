import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { ShipmentRef } from "../../production/channels/handover/index.js";
import { HandedOverOrdersReader } from "../domain/ports/handed-over-orders.reader.js";
import { shipmentsOf } from "./first-shipment.key.js";

/** Les attestations de retrait des envois demandés — une requête, quel que soit leur nombre. */
@Injectable()
export class PrismaHandedOverOrdersReader extends HandedOverOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async handedOverAmong(shipments: readonly ShipmentRef[]): Promise<readonly ShipmentRef[]> {
    if (shipments.length === 0) {
      return [];
    }
    const rows = await this.prisma.orderHandover.findMany({
      where: shipmentsOf(shipments),
      select: { orderId: true, rank: true },
    });
    return rows.map((row) => ShipmentRef.of(row.orderId, row.rank));
  }
}
