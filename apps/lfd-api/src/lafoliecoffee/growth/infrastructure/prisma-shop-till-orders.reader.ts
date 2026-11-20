import { pickupSnapshotSchema } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { REVENUE_ORDER_STATUSES } from "../domain/revenue-scope.js";
import { ShopTillOrdersReader } from "../domain/ports/shop-till-orders.reader.js";
import type { ShopTillOrderEntry } from "../domain/shop-till/shop-till-orders-report.js";

/** Le statut d'une commande remise au client. */
const HANDED_OVER = "fulfilled";
/**
 * Le statut d'une commande que le client n'est pas venu retirer. Hors du
 * périmètre du CA (`REVENUE_ORDER_STATUSES`) — rien n'a été vendu —, mais
 * commandée : ce rapport la compte, à part.
 */
const NOT_COLLECTED = "no_show";

/**
 * Les commandes à régler en boutique d'une période de retrait — une requête,
 * bornée par le jour demandé (`@db.Date`). Statuts : ceux d'une commande
 * passée (`REVENUE_ORDER_STATUSES`) et la non retirée, le lieu `shop_till` en plus.
 */
@Injectable()
export class PrismaShopTillOrdersReader extends ShopTillOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async entries(from: string, to: string): Promise<readonly ShopTillOrderEntry[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        settlementVenue: "shop_till",
        status: { in: [...REVENUE_ORDER_STATUSES, NOT_COLLECTED] },
        requestedDeliveryDate: {
          gte: new Date(`${from}T00:00:00.000Z`),
          lte: new Date(`${to}T00:00:00.000Z`),
        },
      },
      select: { status: true, totalCents: true, requestedDeliveryDate: true, pickupAddress: true },
    });
    return rows.flatMap((row) => {
      if (row.requestedDeliveryDate === null) {
        return [];
      }
      const pickup = pickupSnapshotSchema.safeParse(row.pickupAddress);
      return [
        {
          day: row.requestedDeliveryDate.toISOString().slice(0, 10),
          siteId: pickup.success ? (pickup.data.siteId ?? null) : null,
          pickupLabel: pickup.success && pickup.data.label !== "" ? pickup.data.label : null,
          totalCents: row.totalCents,
          handedOver: row.status === HANDED_OVER,
          notCollected: row.status === NOT_COLLECTED,
        },
      ];
    });
  }
}
