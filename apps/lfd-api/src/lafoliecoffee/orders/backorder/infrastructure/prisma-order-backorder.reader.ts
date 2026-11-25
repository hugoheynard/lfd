import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../../platform/database/prisma.service.js";
import {
  OrderBackorderReader,
  type OrderBackorders,
} from "../domain/ports/order-backorder.reader.js";
import { BACKORDER_VIEW_SELECT, backorderViewOf } from "./backorder-view.mapper.js";

/** Les deux liens d'une commande, par leurs clés uniques : origine, ou commande issue. */
@Injectable()
export class PrismaOrderBackorderReader extends OrderBackorderReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async of(orderId: string): Promise<OrderBackorders> {
    const [own, from] = await Promise.all([
      this.prisma.backorder.findUnique({
        where: { originOrderId: orderId },
        select: BACKORDER_VIEW_SELECT,
      }),
      this.prisma.backorder.findUnique({
        where: { convertedOrderId: orderId },
        select: { id: true, originOrderId: true, originOrder: { select: { orderNumber: true } } },
      }),
    ]);
    return {
      backorder: own === null ? null : backorderViewOf(own),
      origin:
        from === null
          ? null
          : {
              backorderId: from.id,
              origin: { orderId: from.originOrderId, orderNumber: from.originOrder.orderNumber },
            },
    };
  }
}
