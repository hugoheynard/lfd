import type { DeliveryDayAddressOrder } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { DeliveryDayOrdersReader } from "../../../delivery/channels/commerce/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { snapshotOf } from "./delivery-run-sheet.query.js";
import { customerLabelOf, expectedOnWhere } from "./handover-order.query.js";
import { fulfillmentOf, windowOf } from "./order-fulfillment.parse.js";

/** Ce que la vue du jour lit d'une commande : qui, où, à quelle heure. Aucun montant. */
const DAY_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  companyId: true,
  deliveryAddressId: true,
  fulfillment: true,
  deliveryAddressSnapshot: true,
  company: { select: { raisonSociale: true } },
  placedBy: { select: { email: true, firstName: true, lastName: true } },
} as const;

/**
 * **Les livraisons d'un jour, vues du carnet** — l'adaptateur de
 * `DeliveryDayOrdersReader`, chez le propriétaire des commandes.
 *
 * « Attendue ce jour » est `expectedOnWhere`, le filtre de la file du comptoir
 * et de la feuille de route, restreint au coursier ; les annulées sont
 * écartées dans la requête. L'heure est la fenêtre CONVENUE à la passation,
 * comme pour le calculateur de tournée (`stopPointsOf`).
 */
@Injectable()
export class PrismaDeliveryDayOrdersReader extends DeliveryDayOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async deliveriesOn(day: string): Promise<readonly DeliveryDayAddressOrder[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        ...expectedOnWhere(day),
        fulfillmentMethod: "delivery",
        NOT: { status: "cancelled" },
      },
      orderBy: { createdAt: "asc" },
      select: DAY_ORDER_SELECT,
    });
    return rows.map((row) => {
      const window = windowOf(fulfillmentOf(row.fulfillment));
      return {
        orderId: row.id,
        reference: row.orderNumber,
        customerLabel: customerLabelOf(row),
        companyId: row.companyId,
        addressId: row.deliveryAddressId,
        address: snapshotOf(row.deliveryAddressSnapshot),
        window: window === null ? null : { start: window.start, end: window.end },
      };
    });
  }
}
