import { exposedHandoverToken } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import {
  OrderBagLabelReader,
  type OrderBagLabelFacts,
} from "../../../packing/channels/commerce/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderMailOrigins } from "../domain/ports/order-mail-origins.js";
import { handoverUrlOf } from "../domain/services/handover-url.js";
import { PrismaOrderPrintColors } from "./prisma-order-print-colors.reader.js";

/**
 * L'adaptateur d'`OrderBagLabelReader` (colisage) : la couleur par la lecture
 * des papiers du fournil (`PrismaOrderPrintColors`), le QR par la fabrique des
 * courriels et du bon (`handoverUrlOf`), sur le jeton qu'on a le droit de
 * montrer (`exposedHandoverToken` — une commande carte non réglée n'a pas de
 * QR, ni sur son bon ni sur ses sacs).
 *
 * **Le même QR sur le sac d'un reste** (plan E7 reliquat, choix 13, L4c) : le
 * jeton est un par COMMANDE, et le scan rend ensuite les envois prêts de la
 * commande. Rien ici ne lit le rang, et c'est voulu — le client garde un seul
 * code pour toute sa commande.
 */
@Injectable()
export class PackingOrderBagLabelReader extends OrderBagLabelReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly colors: PrismaOrderPrintColors,
    private readonly origins: OrderMailOrigins,
  ) {
    super();
  }

  async factsOf(orderId: string): Promise<OrderBagLabelFacts | null> {
    const [order, colors] = await Promise.all([
      this.prisma.order.findUnique({
        where: { id: orderId },
        select: { handoverToken: true, paymentStatus: true },
      }),
      this.colors.colorsOf([orderId]),
    ]);
    if (order === null) {
      return null;
    }
    return {
      color: colors.get(orderId) ?? null,
      handoverUrl: handoverUrlOf(this.origins.adminBaseUrl(), exposedHandoverToken(order)),
    };
  }
}
