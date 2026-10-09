import { Injectable } from "@nestjs/common";

import { OrderStatus, PaymentStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { UnsettledShopOrderCanceller } from "../domain/ports/unsettled-shop-order.canceller.js";
import { unsettledShopOrderWhere } from "./unsettled-shop-order.where.js";

/** Adaptateur Prisma de l'écriture d'expiration : la règle est dans le `where`. */
@Injectable()
export class PrismaUnsettledShopOrderCanceller extends UnsettledShopOrderCanceller {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async cancel(orderId: string): Promise<boolean> {
    const { count } = await this.prisma.order.updateMany({
      where: { id: orderId, ...unsettledShopOrderWhere() },
      data: { status: OrderStatus.cancelled, paymentStatus: PaymentStatus.failed },
    });
    return count === 1;
  }
}
