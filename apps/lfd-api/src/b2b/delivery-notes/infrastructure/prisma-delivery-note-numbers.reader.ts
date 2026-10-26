import { Injectable } from "@nestjs/common";

import {
  DeliveryNoteNumbersReader,
  type DeliveryShipmentKey,
  type DeliveryShipmentNoteNumber,
} from "../../../delivery/channels/commerce/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";

/**
 * L'adaptateur de `DeliveryNoteNumbersReader` (livraison, 2026-10-26) : le
 * numéro du BL non annulé de chaque envoi `(commande, rang)`. Aucun mur : les
 * papiers de tournée sont ceux du staff, qui voit toutes les commandes du jour
 * — comme `ProductionPlannedDeliveryNotesReader`.
 *
 * Une requête pour tous les envois : les commandes, puis le rang trié en
 * mémoire (une commande a une poignée de BL au plus).
 */
@Injectable()
export class PrismaDeliveryNoteNumbersReader extends DeliveryNoteNumbersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async numbersOf(
    shipments: readonly DeliveryShipmentKey[],
  ): Promise<readonly DeliveryShipmentNoteNumber[]> {
    if (shipments.length === 0) {
      return [];
    }
    const rows = await this.prisma.deliveryNote.findMany({
      where: {
        orderId: { in: [...new Set(shipments.map((shipment) => shipment.orderId))] },
        status: { not: "voided" },
      },
      select: { orderId: true, rank: true, number: true },
    });
    return rows.filter((row) =>
      shipments.some((shipment) => shipment.orderId === row.orderId && shipment.rank === row.rank),
    );
  }
}
