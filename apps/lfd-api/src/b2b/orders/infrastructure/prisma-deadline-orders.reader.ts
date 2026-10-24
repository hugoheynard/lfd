import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  DeadlineOrdersReader,
  type SitedDeadlineOrder,
} from "../domain/ports/deadline-orders.reader.js";
import { STATUSES_AWAITING_PICKUP } from "../domain/ports/site-arrival-orders.reader.js";
import { fulfillmentOf } from "./order-fulfillment.parse.js";
import { siteIdOf } from "./pickup-site.parse.js";
import { settlementWhere } from "./plan-filter.js";

/**
 * Adaptateur Prisma de `DeadlineOrdersReader` : les commandes vivantes d'une
 * journée — statut par `STATUSES_AWAITING_PICKUP`, argent par
 * `settlementWhere`. Jamais `planWhere` : il ne garde que `placed`, et le
 * compte à rebours se vidait à l'arrêt du plan (corrigé le 2026-10-24).
 *
 * La fenêtre est lue du JSON `fulfillment` par le parseur partagé ; une
 * commande antérieure à la colonne rend `null`, c'est-à-dire « sans échéance ».
 */
@Injectable()
export class PrismaDeadlineOrdersReader extends DeadlineOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async forDay(day: string): Promise<readonly SitedDeadlineOrder[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        // Colonne `date` lue à minuit UTC : même composition que `producibleFor`.
        requestedDeliveryDate: new Date(`${day}T00:00:00.000Z`),
        status: { in: [...STATUSES_AWAITING_PICKUP] },
        ...settlementWhere(),
      },
      orderBy: { orderNumber: "asc" },
      select: {
        fulfillmentMethod: true,
        fulfillment: true,
        pickupAddress: true,
        lines: { select: { sku: true, productNameSnapshot: true, quantity: true } },
      },
    });
    return rows.map((row) => ({
      fulfillmentMethod: row.fulfillmentMethod === "delivery" ? "delivery" : "pickup",
      window: fulfillmentOf(row.fulfillment).window.value,
      // Le site figé à la passation (S2) ; `null` en livraison ou avant le lot.
      siteId: row.fulfillmentMethod === "delivery" ? null : siteIdOf(row.pickupAddress),
      lines: row.lines.map((line) => ({
        sku: line.sku,
        productName: line.productNameSnapshot,
        quantity: line.quantity,
      })),
    }));
  }
}
