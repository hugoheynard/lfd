import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  PackingSheetTombstones,
  type PackingSheetTombstone,
} from "../domain/ports/packing-sheet-tombstones.js";

/**
 * `INSERT … ON CONFLICT DO NOTHING` (`skipDuplicates`) par le client routé :
 * dans l'unité de travail de l'annulation. `listed`, comme toute feuille
 * inscrite depuis K2b.
 */
@Injectable()
export class PrismaPackingSheetTombstones extends PackingSheetTombstones {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lay(tombstone: PackingSheetTombstone): Promise<void> {
    await this.prisma.packingOrder.createMany({
      data: [
        {
          serviceDay: tombstone.serviceDay,
          orderId: tombstone.orderId,
          reference: tombstone.reference,
          customerLabel: tombstone.customerLabel,
          fulfillmentMethod: tombstone.fulfillmentMethod,
          dueAt: tombstone.dueAt,
          clientele: tombstone.clientele,
          siteId: tombstone.siteId,
          drawnAt: tombstone.withdrawnAt,
          containerMode: "listed",
          withdrawnAt: tombstone.withdrawnAt,
        },
      ],
      skipDuplicates: true,
    });
  }
}
