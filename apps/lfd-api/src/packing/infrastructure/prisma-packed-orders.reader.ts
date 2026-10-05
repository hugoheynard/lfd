import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  PackedOrdersReader,
  type PackedOrderSeal,
} from "../../production/channels/packing/index.js";

/**
 * « Lesquelles de cette journée sont colisées ? » — implémente le port étroit
 * que le fournil déclare (K3a, §17.2). Une requête sur `packing_order`, les
 * bacs fermés seulement : le CHECK de la table tient `packed_at` et
 * `packed_by` ensemble.
 */
@Injectable()
export class PrismaPackedOrdersReader extends PackedOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async packedOn(serviceDay: string): Promise<ReadonlyMap<string, PackedOrderSeal>> {
    const rows = await this.prisma.packingOrder.findMany({
      where: { serviceDay, packedAt: { not: null } },
      select: { orderId: true, packedAt: true, packedBy: true },
    });
    const sealed = new Map<string, PackedOrderSeal>();
    for (const row of rows) {
      if (row.packedAt !== null && row.packedBy !== null) {
        sealed.set(row.orderId, { at: row.packedAt, by: row.packedBy });
      }
    }
    return sealed;
  }
}
