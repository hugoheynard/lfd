import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  RemainderShipmentReader,
  type RemainderShipment,
} from "../domain/ports/remainder-shipment.reader.js";

/** Le BL vivant d'un reste, lu par `(commande, rang)` — l'unicité de la table. */
@Injectable()
export class PrismaRemainderShipmentReader extends RemainderShipmentReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async find(orderId: string, rank: number): Promise<RemainderShipment | null> {
    const row = await this.prisma.deliveryNote.findUnique({
      where: { orderId_rank: { orderId, rank } },
      select: { status: true, lines: { select: { quantity: true } } },
    });
    if (row === null || row.status === "voided") {
      return null;
    }
    return {
      pieces: row.lines.reduce((sum, line) => sum + line.quantity, 0),
      handedOver: row.status === "handed_over",
    };
  }
}
