import { Injectable } from "@nestjs/common";

import { DepartureSiteReader } from "../../../delivery/channels/commerce/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderSheetColorSource } from "../domain/ports/order-sheet-color.source.js";
import { orderCategoryColor } from "../domain/services/order-category-color.js";
import { siteIdOf } from "./pickup-site.parse.js";

const COLORS_SELECT = {
  pickupColorB2b: true,
  pickupColorB2c: true,
  deliveryColorB2b: true,
  deliveryColorB2c: true,
} as const;

/**
 * L'adaptateur de `OrderSheetColorSource` : la commande (mode, clientèle,
 * site figé à la passation), puis le site qui la peint — le sien pour un
 * retrait, le départ des tournées tel que la livraison le résout pour une
 * livraison. Les sites archivés se résolvent aussi.
 */
@Injectable()
export class PrismaOrderSheetColorSource extends OrderSheetColorSource {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departure: DepartureSiteReader,
  ) {
    super();
  }

  async colorOf(orderId: string): Promise<string | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { fulfillmentMethod: true, clientele: true, pickupAddress: true },
    });
    if (order === null) {
      return null;
    }
    const method = order.fulfillmentMethod === "delivery" ? "delivery" : "pickup";
    const siteId =
      method === "pickup" ? siteIdOf(order.pickupAddress) : await this.departure.currentSiteId();
    const site =
      siteId === null
        ? null
        : await this.prisma.site.findUnique({ where: { id: siteId }, select: COLORS_SELECT });
    return orderCategoryColor(method, order.clientele, site);
  }
}
