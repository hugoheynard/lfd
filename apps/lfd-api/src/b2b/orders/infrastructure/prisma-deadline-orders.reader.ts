import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { DeadlineOrdersReader } from "../domain/ports/deadline-orders.reader.js";
import type { DeadlineOrder } from "../domain/services/deadline-thresholds.js";
import { fulfillmentOf } from "./order-fulfillment.parse.js";
import { planWhere } from "./plan-filter.js";

/**
 * Adaptateur Prisma de `DeadlineOrdersReader` : les commandes du plan d'une
 * journée — le même `where` que la clôture (`PrismaDayOrdersReader`), pour
 * que le compte à rebours et le compte à produire parlent des mêmes commandes.
 *
 * La fenêtre est lue du JSON `fulfillment` par le parseur partagé ; une
 * commande antérieure à la colonne rend `null`, c'est-à-dire « sans échéance ».
 */
@Injectable()
export class PrismaDeadlineOrdersReader extends DeadlineOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async forDay(day: string): Promise<readonly DeadlineOrder[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        // Colonne `date` lue à minuit UTC : même composition que `producibleFor`.
        requestedDeliveryDate: new Date(`${day}T00:00:00.000Z`),
        ...planWhere(),
      },
      orderBy: { orderNumber: "asc" },
      select: {
        fulfillmentMethod: true,
        fulfillment: true,
        lines: { select: { sku: true, productNameSnapshot: true, quantity: true } },
      },
    });
    return rows.map((row) => ({
      fulfillmentMethod: row.fulfillmentMethod === "delivery" ? "delivery" : "pickup",
      window: fulfillmentOf(row.fulfillment).window.value,
      lines: row.lines.map((line) => ({
        sku: line.sku,
        productName: line.productNameSnapshot,
        quantity: line.quantity,
      })),
    }));
  }
}
