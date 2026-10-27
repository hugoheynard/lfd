import { Injectable } from "@nestjs/common";

import { OrderStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { VoucherOrderReader, type VoucherOrder } from "../domain/ports/voucher-order.reader.js";

/** Le jour de service est rangé à minuit UTC : sa date ISO EST le jour. */
const ISO_DAY_LENGTH = 10;

/**
 * Les commandes vivantes qui portent des bons, en Postgres. Le filtre
 * `status <> cancelled` est celui de l'index unique partiel : au plus une
 * ligne par bon.
 */
@Injectable()
export class PrismaVoucherOrderReader extends VoucherOrderReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async liveOrdersCarrying(
    voucherIds: readonly string[],
  ): Promise<ReadonlyMap<string, VoucherOrder>> {
    if (voucherIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.order.findMany({
      where: { loyaltyVoucherId: { in: [...voucherIds] }, status: { not: OrderStatus.cancelled } },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        voucherDiscountCents: true,
        loyaltyVoucherId: true,
        requestedDeliveryDate: true,
      },
    });
    const found = new Map<string, VoucherOrder>();
    for (const row of rows) {
      if (row.loyaltyVoucherId === null) {
        continue;
      }
      found.set(row.loyaltyVoucherId, {
        voucherId: row.loyaltyVoucherId,
        orderId: row.id,
        orderNumber: row.orderNumber,
        status: row.status,
        paymentStatus: row.paymentStatus,
        voucherDiscountCents: row.voucherDiscountCents,
        serviceDay: row.requestedDeliveryDate?.toISOString().slice(0, ISO_DAY_LENGTH) ?? null,
      });
    }
    return found;
  }
}
