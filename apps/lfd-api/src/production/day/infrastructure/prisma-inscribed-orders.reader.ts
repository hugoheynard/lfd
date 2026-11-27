import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { FIRST_SHIPMENT_RANK } from "../domain/value-objects/shipment-ref.value-object.js";
import { InscribedOrdersReader } from "../../channels/commerce/inscribed-orders.reader.js";

/**
 * Lit `production_order` en une requête pour tout le lot. Seul le premier
 * envoi compte : un reliquat inscrit ne dit rien de la commande elle-même.
 */
@Injectable()
export class PrismaInscribedOrdersReader extends InscribedOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async inscribedAmong(orderIds: readonly string[]): Promise<ReadonlySet<string>> {
    if (orderIds.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.productionOrder.findMany({
      where: { orderId: { in: [...orderIds] }, rank: FIRST_SHIPMENT_RANK },
      select: { orderId: true },
    });
    return new Set(rows.map((row) => row.orderId));
  }
}
