import { Injectable } from "@nestjs/common";

import {
  type DeliveryOrderLine,
  DeliveryOrderLinesReader,
} from "../../../delivery/channels/commerce/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";

/**
 * **Les lignes d'une commande, relayées au colisage** — l'adaptateur de
 * `DeliveryOrderLinesReader` (plan de tournée, lot 4 bis, L4b-C4).
 *
 * Le SKU, le nom figé et la quantité ; **aucun montant**. Lu par identifiant
 * de commande pour le personnel du fournil (surface d'administration), comme
 * `PrismaDeliveryOrdersReader.byIds` : aucun mur de société à poser.
 */
@Injectable()
export class PrismaDeliveryOrderLinesReader extends DeliveryOrderLinesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async linesOf(orderId: string): Promise<readonly DeliveryOrderLine[]> {
    const rows = await this.prisma.orderLine.findMany({
      where: { orderId },
      orderBy: { id: "asc" },
      select: { sku: true, productNameSnapshot: true, quantity: true },
    });
    return rows.map((row) => ({
      sku: row.sku,
      name: row.productNameSnapshot,
      quantity: row.quantity,
    }));
  }
}
