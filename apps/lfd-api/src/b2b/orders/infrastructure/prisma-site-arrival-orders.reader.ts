import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  STATUSES_AWAITING_PICKUP,
  type SiteArrivalOrder,
  SiteArrivalOrdersReader,
} from "../domain/ports/site-arrival-orders.reader.js";
import { fulfillmentOf } from "./order-fulfillment.parse.js";
import { siteIdOf } from "./pickup-site.parse.js";
import { settlementWhere } from "./plan-filter.js";

/**
 * Adaptateur Prisma de `SiteArrivalOrdersReader` : les retraits vivants d'une
 * journée. L'argent par le fragment partagé (`settlementWhere`), le statut par
 * la liste du domaine — jamais `planWhere`, qui se vide à l'arrêt.
 */
@Injectable()
export class PrismaSiteArrivalOrdersReader extends SiteArrivalOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async forDay(day: string): Promise<readonly SiteArrivalOrder[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        // Colonne `date` lue à minuit UTC : même composition que `producibleFor`.
        requestedDeliveryDate: new Date(`${day}T00:00:00.000Z`),
        fulfillmentMethod: "pickup",
        status: { in: [...STATUSES_AWAITING_PICKUP] },
        ...settlementWhere(),
      },
      orderBy: { orderNumber: "asc" },
      select: { fulfillment: true, pickupAddress: true },
    });
    return rows.map((row) => ({
      siteId: siteIdOf(row.pickupAddress),
      window: fulfillmentOf(row.fulfillment).window.value,
    }));
  }
}
