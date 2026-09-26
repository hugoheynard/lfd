import { Injectable } from "@nestjs/common";

import { OrderStatus, PaymentStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  UnsettledSettlementReader,
  type UnsettledSettlement,
} from "../domain/ports/unsettled-settlement.reader.js";
import type { SettlementSweepWindow } from "../domain/services/settlement-sweep.js";

/**
 * Adaptateur Prisma du balayage de clôture.
 *
 * Aucun mur `company_id` : c'est une passe d'exploitation sur TOUTE la
 * journée, déclenchée par le fournil, et non une lecture au nom d'un client.
 */
@Injectable()
export class PrismaUnsettledSettlementReader extends UnsettledSettlementReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async unsettledOn(window: SettlementSweepWindow): Promise<readonly UnsettledSettlement[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.placed,
        paymentStatus: { in: [PaymentStatus.pending, PaymentStatus.failed] },
        OR: [
          // La colonne est un `date` Postgres, lu à minuit UTC : même clé que
          // `PrismaDayOrdersReader`, c'est une journée de service, pas un instant.
          { requestedDeliveryDate: new Date(`${window.serviceDay}T00:00:00.000Z`) },
          // Sans jour de retrait : le jour de passation à Paris (Q5, S6).
          {
            requestedDeliveryDate: null,
            createdAt: { gte: window.placedFrom, lt: window.placedBefore },
          },
        ],
      },
      orderBy: { orderNumber: "asc" },
      select: { id: true, stripePaymentIntentId: true },
    });
    return rows.map((row) => ({ orderId: row.id, paymentIntentId: row.stripePaymentIntentId }));
  }
}
